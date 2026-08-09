import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import {
  ageVerifiedStatus,
  Prisma,
  UserRole,
  wavierStatus,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { inviteUserEmail } from "../../../shared/emailHTML";
import { getEffectiveAccessId } from "../../middlewares/access";
import emailSender from "../../../shared/emailSender";
import { Request } from "express";

// create Teamplayer
interface NewPlayerInput {
  fullName: string;
  email?: string;
  phone?: string;
  dob?: string;
  jerseyNum?: string;
  position?: string;
  password?: string;
}
const createTeamplayer = async (req: any) => {
  const userId = req.user.id;
  const coachId = await getEffectiveAccessId(userId);
  const {
    teamregisterId,
    existingPlayerIds = [],
    newPlayers = [] as NewPlayerInput[],
  } = req.body;

  if (!teamregisterId) {
    throw new ApiError(404, "teamregisterId is required");
  }

  const team = await prisma.teamregistration.findFirst({
    where: {
      id: teamregisterId,
      userId: coachId,
    },
  });

  if (!team) {
    throw new ApiError(404, "Team not found or you are not the coach");
  }

  const playerIdsToAdd = new Set<string>();
  const jerseyMap = new Map<string, string>();

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });
  const adminId = admin?.id;

  try {
    // ── 1. Collect existing player IDs ────────────────────────────────────
    if (existingPlayerIds.length > 0) {
      const validExisting = await prisma.user.findMany({
        where: {
          id: { in: existingPlayerIds },
          isDeleted: false,
          role: UserRole.PLAYER,
        },
        select: { id: true },
      });
      validExisting.forEach((p) => playerIdsToAdd.add(p.id));
    }

    // ── 2. Process new players (create if not found) ──────────────────────
    for (const np of newPlayers) {
      let playerId: string | null = null;

      if (np.email) {
        const existing = await prisma.user.findUnique({
          where: { email: np.email },
          select: { id: true, isDeleted: true },
        });

        if (existing && !existing.isDeleted) {
          playerId = existing.id;
        }
      }

      // Create new player if not found
      if (!playerId) {
        const dobDate = np.dob ? new Date(np.dob) : null;

        let hashedPassword: string | undefined = undefined;
        if (np.password) {
          hashedPassword = await bcrypt.hash(
            np.password,
            Number(process.env.BCRYPT_SALT_ROUNDS || 10),
          );
        }

        const created = await prisma.user.create({
          data: {
            fullName: np.fullName,
            email: np.email || null,
            phoneNumber: np.phone || null,
            jerseyNum: np.jerseyNum || null,
            dob: dobDate,
            role: UserRole.PLAYER,
            createdById: coachId,
            password: hashedPassword,
          },
          select: { id: true },
        });

        playerId = created.id;

        if (np.email && np.password) {
          const html = inviteUserEmail(np.fullName, np.password);
          await emailSender(np.email, html, "Player Account Invitation");
        }
      }

      if (playerId && np.jerseyNum) {
        jerseyMap.set(playerId, np.jerseyNum);
      }

      if (playerId) {
        playerIdsToAdd.add(playerId);
      }
    }

    // ── 3. Categorise players into: active, restore, create ──────────────
    //
    // Because of @@unique([playerId, teamregistrationId]) we can never INSERT
    // a second row for the same player+team combo. Instead we must UPDATE the
    // soft-deleted row back to isDeletedTeamPlayer = false (restore).
    //
    const alreadyMembers = await prisma.teamplayer.findMany({
      where: {
        teamregistrationId: teamregisterId,
        playerId: { in: Array.from(playerIdsToAdd) },
      },
      select: { playerId: true, isDeletedTeamPlayer: true },
    });

    // Players who already have an ACTIVE row — skip entirely
    const activeSet = new Set(
      alreadyMembers
        .filter((m) => !m.isDeletedTeamPlayer)
        .map((m) => m.playerId),
    );

    // Players whose row exists but was soft-deleted — restore it
    const toRestore = alreadyMembers
      .filter((m) => m.isDeletedTeamPlayer)
      .map((m) => m.playerId);

    // Players with no row at all — create fresh
    const existingSet = new Set(alreadyMembers.map((m) => m.playerId));
    const toCreate = Array.from(playerIdsToAdd).filter(
      (id) => !existingSet.has(id),
    );

    // Combined count of slots we are about to add to the active roster
    const toAdd = [...toRestore, ...toCreate];

    if (toAdd.length === 0) {
      throw new ApiError(
        400,
        "No new valid players to add (all already exist or invalid)",
      );
    }

    // ── 4. Roster limit check ─────────────────────────────────────────────
    const currentCount = team.totalRegisteredPlayers;
    const maxAllowed = team.maxPlayers;
    const requested = toAdd.length;

    if (currentCount + requested > maxAllowed) {
      throw new ApiError(
        409,
        `Cannot add ${requested} player(s). Team roster limit reached (` +
        `${currentCount}/${maxAllowed} players already registered). ` +
        `Maximum ${maxAllowed - currentCount} slot(s) left.`,
      );
    }

    // ── 5a. Restore soft-deleted teamplayer rows ──────────────────────────
    //
    // isDeletedTeamPlayer = false  → re-activate the roster slot
    // Reset all waiver fields so the player starts completely fresh
    //
    if (toRestore.length > 0) {
      await prisma.teamplayer.updateMany({
        where: {
          teamregistrationId: teamregisterId,
          playerId: { in: toRestore },
          isDeletedTeamPlayer: true, // safety guard — only touch deleted rows
        },
        data: {
          isDeletedTeamPlayer: false, // re-activate the roster slot
          userId: coachId, // update to the current coach
          status: "Pending", // reset waiver status
          ageVerified: "Check_in_required", // reset age-verification
          isAgree: false, // clear previous agreement
          signName: null, // clear signature name
          signedAt: null, // clear signed timestamp
        },
      });
    }

    // ── 5b. Create brand-new teamplayer rows ──────────────────────────────
    let createTeamPlayer = { count: 0 };
    if (toCreate.length > 0) {
      const rosterEntries = toCreate.map((playerId) => ({
        teamregistrationId: teamregisterId,
        playerId,
        userId: coachId,
      }));

      createTeamPlayer = await prisma.teamplayer.createMany({
        data: rosterEntries,
      });
    }

    // Total slots added to the active roster (restored + newly created)
    const totalAdded = toRestore.length + createTeamPlayer.count;

    // ── 6. Update jersey numbers ──────────────────────────────────────────
    if (jerseyMap.size > 0) {
      await Promise.all(
        Array.from(jerseyMap.entries()).map(([playerId, jerseyNum]) =>
          prisma.user.update({
            where: { id: playerId },
            data: { jerseyNum },
          }),
        ),
      );
    }

    // ── 7. Increment totalRegisteredPlayers on the registration ───────────
    if (totalAdded > 0) {
      await prisma.teamregistration.update({
        where: { id: teamregisterId },
        data: {
          totalRegisteredPlayers: { increment: totalAdded },
        },
      });
    }

    // ── 8. Fetch the final roster entries for the response ────────────────
    const addedPlayers = await prisma.teamplayer.findMany({
      where: {
        teamregistrationId: teamregisterId,
        isDeletedTeamPlayer: false,
        playerId: { in: toAdd },
      },
      select: {
        id: true,
        status: true,
        ageVerified: true,
        isAgree: true,
        createdAt: true,
        player: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phoneNumber: true,
            jerseyNum: true,
            dob: true,
            profileImage: true,
          },
        },
      },
    });

    // ── 9. Admin notification ─────────────────────────────────────────────
    if (admin?.isTeamUpdateNotify === true) {
      await prisma.notification.create({
        data: {
          userId: adminId!,
          title: "New Players Added to Team",
          body: `Added ${totalAdded} player(s) to the team ${team.teamName}.`,
        },
      });
    }

    // ── 10. Activity logs ─────────────────────────────────────────────────
    await prisma.activityLog.create({
      data: {
        userId: adminId!,
        title: "Players Added to Team",
        content: `Added ${totalAdded} player(s) to the team ${team.teamName}.`,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: coachId,
        title: "New Players Added to Team",
        content: `Added ${totalAdded} player(s) to the team ${team.teamName} (Team Registration ID: ${teamregisterId}).`,
      },
    });

    return {
      message: `Successfully added ${totalAdded} player(s)`,
      addedCount: totalAdded,
      addedPlayers,
    };
  } catch (err: any) {
    console.error(err);
    return {
      success: false,
      message: err.message || "Failed to add players",
    };
  }
};
// const createTeamplayer = async (req: any) => {
//   const userId = req.user.id;
//   const coachId = await getEffectiveAccessId(userId);
//   const {
//     teamregisterId,
//     existingPlayerIds = [],
//     newPlayers = [] as NewPlayerInput[],
//   } = req.body;

//   if (!teamregisterId) {
//     throw new ApiError(404, "teamregisterId is required");
//   }

//   const team = await prisma.teamregistration.findFirst({
//     where: {
//       id: teamregisterId,
//       userId: coachId,
//     },
//   });

//   if (!team) {
//     throw new ApiError(404, "Team not found or you are not the coach");
//   }

//   const playerIdsToAdd = new Set<string>();
//   const jerseyMap = new Map<string, string>();

//   const admin = await prisma.user.findFirst({
//     where: { role: UserRole.ADMIN },
//   });
//   const adminId = admin?.id;

//   try {
//     const userId = req.user.id;
//     const coachId = await getEffectiveAccessId(userId);
//     const {
//       teamregisterId,
//       existingPlayerIds = [],
//       newPlayers = [] as NewPlayerInput[],
//     } = req.body;

//     if (!teamregisterId) {
//       throw new ApiError(404, "teamregisterId is required");
//     }

//     if (existingPlayerIds.length > 0) {
//       const validExisting = await prisma.user.findMany({
//         where: {
//           id: { in: existingPlayerIds },
//           isDeleted: false,
//           role: UserRole.PLAYER,
//         },
//         select: { id: true },
//       });
//       validExisting.forEach((p) => playerIdsToAdd.add(p.id));
//     }

//     for (const np of newPlayers) {
//       let playerId: string | null = null;

//       if (np.email) {
//         const existing = await prisma.user.findUnique({
//           where: { email: np.email },
//           select: { id: true, isDeleted: true },
//         });

//         if (existing && !existing.isDeleted) {
//           playerId = existing.id;
//         }
//       }

//       // Create new player if not found
//       if (!playerId) {
//         const dobDate = np.dob ? new Date(np.dob) : null;

//         let hashedPassword: string | undefined = undefined;
//         if (np.password) {
//           hashedPassword = await bcrypt.hash(
//             np.password,
//             Number(process.env.BCRYPT_SALT_ROUNDS || 10),
//           );
//         }

//         const created = await prisma.user.create({
//           data: {
//             fullName: np.fullName,
//             email: np.email || null,
//             phoneNumber: np.phone || null,
//             jerseyNum: np.jerseyNum || null,
//             dob: dobDate,
//             role: UserRole.PLAYER,
//             createdById: coachId,
//             password: hashedPassword,
//           },
//           select: { id: true },
//         });

//         playerId = created.id;

//         if (np.email && np.password) {
//           const html = inviteUserEmail(np.fullName, np.password);
//           await emailSender(np.email, html, "Player Account Invitation");
//         }
//       }

//       if (playerId && np.jerseyNum) {
//         jerseyMap.set(playerId, np.jerseyNum);
//       }

//       if (playerId) {
//         playerIdsToAdd.add(playerId);
//       }
//     }

//     const alreadyMembers = await prisma.teamplayer.findMany({
//       where: {
//         teamregistrationId: teamregisterId,
//         playerId: { in: Array.from(playerIdsToAdd) },
//       },
//       select: { playerId: true },
//     });

//     const alreadySet = new Set(alreadyMembers.map((m) => m.playerId));
//     const toAdd = Array.from(playerIdsToAdd).filter(
//       (id) => !alreadySet.has(id),
//     );

//     if (toAdd.length === 0) {
//       throw new ApiError(
//         400,
//         "No new valid players to add (all already exist or invalid)",
//       );
//     }

//     const currentCount = team.totalRegisteredPlayers;
//     const maxAllowed = team.maxPlayers;
//     const requested = toAdd.length;

//     if (currentCount + requested > maxAllowed) {
//       throw new ApiError(
//         409,
//         `Cannot add ${requested} player(s). Team roster limit reached (` +
//         `${currentCount}/${maxAllowed} players already registered). ` +
//         `Maximum ${maxAllowed - currentCount} slot(s) left.`,
//       );
//     }

//     if (currentCount + requested > maxAllowed) {
//       throw new ApiError(
//         409,
//         `Cannot add ${requested} player(s). Team roster limit reached ` +
//         `(${currentCount}/${maxAllowed} already registered). ` +
//         `Maximum ${maxAllowed - currentCount} slot(s) left.`,
//       );
//     }

//     const rosterEntries = toAdd.map((playerId) => ({
//       teamregistrationId: teamregisterId,
//       playerId,
//       userId: coachId,
//     }));

//     const createTeamPlayer = await prisma.teamplayer.createMany({
//       data: rosterEntries,
//     });

//     if (jerseyMap.size > 0) {
//       await Promise.all(
//         Array.from(jerseyMap.entries()).map(([playerId, jerseyNum]) =>
//           prisma.user.update({
//             where: { id: playerId },
//             data: { jerseyNum },
//           }),
//         ),
//       );
//     }

//     if (createTeamPlayer.count > 0) {
//       await prisma.teamregistration.update({
//         where: { id: teamregisterId },
//         data: {
//           totalRegisteredPlayers: { increment: createTeamPlayer.count },
//         },
//       });
//     }

//     const addedPlayers = await prisma.teamplayer.findMany({
//       where: {
//         teamregistrationId: teamregisterId,
//         isDeletedTeamPlayer: false,
//         playerId: { in: toAdd },
//       },
//       select: {
//         id: true,
//         status: true,
//         ageVerified: true,
//         isAgree: true,
//         createdAt: true,
//         player: {
//           select: {
//             id: true,
//             fullName: true,
//             email: true,
//             phoneNumber: true,
//             jerseyNum: true,
//             dob: true,
//             profileImage: true,
//           },
//         },
//       },
//     });

//     if (admin?.isTeamUpdateNotify === true) {
//       await prisma.notification.create({
//         data: {
//           userId: adminId!,
//           title: "New Players Added to Team",
//           body: `Added ${toAdd.length} player(s) to the team ${team.teamName}.`,
//         },
//       })
//     }

//     await prisma.activityLog.create({
//       data: {
//         userId: adminId!,
//         title: "Players Added to Team",
//         content: `Added ${toAdd.length} player(s) to the team ${team.teamName}.`,
//       },
//     });

//     await prisma.activityLog.create({
//       data: {
//         userId: coachId,
//         title: "New Players Added to Team",
//         content: `Added  player(s) to the team ${team.teamName} (Team Registration ID: ${teamregisterId}).`,
//       },
//     });

//     return {
//       message: `Successfully added ${toAdd.length} player(s)`,
//       addedCount: toAdd.length,
//       addedPlayers,
//     };
//   } catch (err: any) {
//     console.error(err);
//     return {
//       success: false,
//       message: err.message || "Failed to add players",
//     };
//   }
// };
// get all Teamplayer
type ITeamplayerFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  jerseyNum?: string;
  status?: string | string[];
  ageVerified?: ageVerifiedStatus;
  teamregistrationId?: string;
  playerId?: string;
  userId?: string;
  teamId?: string;
};
const teamplayerSearchAbleFields = ["jerseyNum"];

const getTeamplayerList = async (
  options: IPaginationOptions,
  filters: ITeamplayerFilterRequest,
  userId: string,
  role: UserRole,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const team = await prisma.teamregistration.findFirst({
    where: { userId },
    select: {
      team: {
        select: {
          managerId: true,
        },
      },
    },
  });

  const andConditions: Prisma.TeamplayerWhereInput[] = [];

  if (role === "COACH") {
    andConditions.push({ userId });
  } else if (role === "MANAGER") {
    if (team?.team.managerId) {
      andConditions.push({ userId: team?.team.managerId });
    }
  } else if (role === "ADMIN") {
    // andConditions.push({
    //   ageVerified: ageVerifiedStatus.Check_in_required,
    // });
  }

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...teamplayerSearchAbleFields.map((field) => ({
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
          },
        })),
      ],
    });
  }
  if (Object.keys(filterData).length) {
    Object.keys(filterData).forEach((key) => {
      const value = (filterData as any)[key];
      if (value === "" || value === null || value === undefined) return;
      if (["createdAt"].includes(key) && value) {
        const start = new Date(value);
        start.setHours(0, 0, 0, 0);
        const end = new Date(value);
        end.setHours(23, 59, 59, 999);
        andConditions.push({
          createdAt: {
            gte: start.toISOString(),
            lte: end.toISOString(),
          },
        });
        return;
      }
      if (key === "status") {
        const statuses = Array.isArray(value) ? value : [value];
        andConditions.push({
          status: { in: statuses },
        });
        return;
      }
      if (key === "ageVerified") {
        const ageVerified = Array.isArray(value) ? value : [value];
        andConditions.push({
          ageVerified: { in: ageVerified },
        });
        return;
      }
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions: Prisma.TeamplayerWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.teamplayer.findMany({
    skip,
    take: limit,
    where: whereConditions,
    select: {
      id: true,
      status: true,
      ageVerified: true,
      note: true,
      team: {
        select: {
          tourDivision: {
            select: {
              divisionName: true,
            },
          },
        },
      },
      player: {
        select: {
          fullName: true,
          profileImage: true,
          dob: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.teamplayer.count({ where: whereConditions });

  return {
    meta: { total, page, limit },
    data: result,
  };
};

// get Teamplayer by user id
const getTeamplayerByUserId = async (id: string) => {
  const result = await prisma.teamplayer.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      ageVerified: true,
      player: {
        select: {
          fullName: true,
          profileImage: true,
          dob: true,
        },
      },
      team: {
        select: {
          tourDivision: {
            select: {
              divisionName: true,
            },
          },
        },
      },
    },
  });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Teamplayer not found");
  }

  return result;
};

// update Teamplayer
const updateTeamplayer = async (req: Request) => {
  const { id } = req.params;
  const data = req.body;
  const { role } = req.user;

  const admin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });
  const adminId = admin?.id;

  const existingTeamplayer = await prisma.teamplayer.findUnique({
    where: { id },
    select: {
      id: true,
      note: true,
      ageVerified: true,
      isAgree: true,
      signName: true,
      signedAt: true,
      status: true,
      coach: {
        select: {
          id: true,
          fullName: true,
        },
      },
      player: {
        select: {
          fullName: true,
          profileImage: true,
        },
      },
    },
  });

  if (!existingTeamplayer) {
    throw new ApiError(httpStatus.NOT_FOUND, "Teamplayer not found");
  }
  const now = new Date();
  const updateData: Record<string, any> = {
    isAgree: data.isAgree ?? existingTeamplayer.isAgree,
    signName: data.signName ?? existingTeamplayer.signName,
  };

  if (role === UserRole.ADMIN) {
    updateData.ageVerified = data.ageVerified ?? existingTeamplayer.ageVerified;
    updateData.note = data.note ?? existingTeamplayer.note;
  }

  if (data.note) {
    await prisma.activityLog.create({
      data: {
        userId: existingTeamplayer.coach.id!,
        title: "Verification Rejected",
        content: `Player ${existingTeamplayer.player.fullName} verification rejected. Reason: ${data.note}`,
      },
    })
  }

  const isWaiverBeingUpdated =
    data.isAgree !== undefined ||
    data.signName !== undefined ||
    (data.isAgree === true && !existingTeamplayer.isAgree);

  if (isWaiverBeingUpdated) {
    updateData.signedAt = now;

    if (data.isAgree === true && data.signName) {
      updateData.status = wavierStatus.Signed;
    }

    if (admin?.isTeamUpdateNotify === true) {
      await prisma.activityLog.create({
        data: {
          userId: adminId!,
          title: "Waiver Signed",
          content: `Player ${existingTeamplayer.player.fullName} signed the waiver. Status: ${updateData.status}`,
        },
      });
    }

    await prisma.activityLog.create({
      data: {
        userId: existingTeamplayer.coach.id!,
        title: "Waiver Signed",
        content: `Player ${existingTeamplayer.player.fullName} signed the waiver. Status: ${updateData.status}`,
      },
    });
  }

  const updated = await prisma.teamplayer.update({
    where: { id },
    data: updateData,
  });

  return updated;
};

// delete Teamplayer
const deleteTeamplayer = async (id: string) => {
  const teamPlayer = await prisma.teamplayer.findUnique({ where: { id } });

  const result = await prisma.teamplayer.update({
    where: { id },
    data: { isDeletedTeamPlayer: true },
  });

  await prisma.teamregistration.update({
    where: { id: teamPlayer!.teamregistrationId },
    data: {
      totalRegisteredPlayers: { decrement: 1 },
    },
  });

  return result;
};

export const teamplayerService = {
  createTeamplayer,
  getTeamplayerList,
  getTeamplayerByUserId,
  updateTeamplayer,
  deleteTeamplayer,
};
