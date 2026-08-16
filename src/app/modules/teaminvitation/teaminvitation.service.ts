import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { InviteStatus, Prisma } from "@prisma/client";
import { format } from "date-fns";
import { teamInvitationEmailHtml } from "../../../shared/emailHTML";
import { enqueueEmail } from "../../../shared/emailSender";

// create Teaminvitation
const createTeaminvitation = async (
  userId: string,
  toTournamentId: string,
  payload: {
    toTournamentDivisionId: string;
    teamIds: string[];
  },
) => {
  const admin = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });

  if (!admin || admin.role !== "ADMIN") {
    throw new ApiError(httpStatus.FORBIDDEN, "Only admin can invite teams");
  }

  const targetDivision = await prisma.tournamentDivision.findFirst({
    where: {
      id: payload.toTournamentDivisionId,
      tournamentId: toTournamentId,
    },
    select: {
      id: true,
      tournamentId: true,
      divisionName: true,
      maxTeams: true,
      slotsLeft: true,
      tournament: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          location: true,
          registrationDeadline: true,
        },
      },
    },
  });

  if (!targetDivision) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      "Target tournament division not found",
    );
  }

  // validate teams exist + bring coach relation
  const teams = await prisma.teams.findMany({
    where: { id: { in: payload.teamIds } },
    select: {
      id: true,
      teamName: true,
      image: true,
      coachId: true,
      coach: { select: { id: true, fullName: true, email: true } },
    },
  });

  if (teams.length !== payload.teamIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Some teams not found");
  }

  const tournament = targetDivision.tournament;

  const allTeamIds = teams.map((team) => team.id);
  const existingInvites = allTeamIds.length
    ? await prisma.teaminvitation.findMany({
        where: {
          userId,
          toTournamentId: toTournamentId,
          toTournamentDivisionId: payload.toTournamentDivisionId,
          status: { in: ["PENDING", "ACCEPTED"] },
          invitedTeams: { some: { teamId: { in: allTeamIds } } },
        },
        select: {
          invitedTeams: {
            select: { teamId: true },
          },
        },
      })
    : [];
  const duplicateTeamIds = new Set(
    existingInvites.flatMap((invite) =>
      invite.invitedTeams.map((teamInvite) => teamInvite.teamId),
    ),
  );

  const allManagerRows = allTeamIds.length
    ? await prisma.teamManager.findMany({
        where: { teamId: { in: allTeamIds } },
        select: {
          teamId: true,
          manager: { select: { id: true, email: true } },
        },
      })
    : [];

  const managersByTeamId = new Map<
    string,
    { ids: string[]; emails: string[] }
  >();
  for (const row of allManagerRows) {
    if (!row.manager) continue;

    const teamManagers = managersByTeamId.get(row.teamId) ?? {
      ids: [],
      emails: [],
    };
    if (row.manager.id) teamManagers.ids.push(row.manager.id);
    if (row.manager.email) teamManagers.emails.push(row.manager.email);
    managersByTeamId.set(row.teamId, teamManagers);
  }

  // create many invitations (1 per team)
  const created = await prisma.$transaction(async (tx) => {
    const results: any[] = [];

    for (const t of teams) {
      if (duplicateTeamIds.has(t.id)) continue;

      const invitation = await tx.teaminvitation.create({
        data: {
          userId: userId,
          toTournamentId: toTournamentId,
          toTournamentDivisionId: payload.toTournamentDivisionId,
          status: InviteStatus.PENDING,
          invitedTeams: { create: [{ teamId: t.id }] },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          toTournamentId: true,
          toTournamentDivisionId: true,
          createdAt: true,
        },
      });

      results.push({ invitation, team: t });
    }

    return results;
  });

  const notificationPayloads: Array<{
    userId: string;
    title: string;
    body: string;
  }> = [];

  // ✅ send mail outside transaction (avoid holding DB transaction open)
  for (const row of created) {
    const team = row.team;

    // coach recipient
    const coachEmail = team.coach?.email;
    const coachId = team.coach?.id;
    const coachName = team.coach?.fullName ?? "Coach";

    const managerInfo = managersByTeamId.get(team.id) ?? {
      ids: [],
      emails: [],
    };
    const managerEmails = managerInfo.emails.filter(Boolean);
    const managerIds = managerInfo.ids.filter(Boolean);

    const recipients = Array.from(
      new Set([coachEmail, ...managerEmails].filter(Boolean)),
    ) as string[];

    if (!recipients.length) continue;

    const html = teamInvitationEmailHtml({
      coachName,
      teamName: team.teamName,
      tournamentName: tournament.name,
      divisionName: String(targetDivision.divisionName),
      startDate: format(new Date(tournament.startDate), "MMM dd, yyyy"),
      endDate: format(new Date(tournament.endDate), "MMM dd, yyyy"),
      location: tournament.location!,
      registrationDeadline: tournament.registrationDeadline
        ? format(new Date(tournament.registrationDeadline), "MMM dd, yyyy")
        : undefined,
    });

    const subject = `Team Invitation: ${team.teamName} • ${tournament.name} (${targetDivision.divisionName})`;

    // send to all (coach + managers)
    await enqueueEmail({ to: recipients.join(","), subject, html });

    if (coachId) {
      notificationPayloads.push({
        userId: coachId,
        title: subject,
        body: `You have been invited to join a team in ${tournament.name} (${targetDivision.divisionName})`,
      });
    }

    for (const id of managerIds) {
      notificationPayloads.push({
        userId: id,
        title: subject,
        body: `Your Team been invited to join a team in ${tournament.name} (${targetDivision.divisionName})`,
      });
    }
  }

  if (notificationPayloads.length) {
    await prisma.notification.createMany({
      data: notificationPayloads,
    });
  }

  return {
    message: "Invitations created and email sent",
    createdCount: created.length,
    data: created.map((c) => c.invitation),
  };
};

// get all Teaminvitation
type ITeaminvitationFilterRequest = {
  searchTerm?: string;
  id?: string;
  userId?: string;
  toTournamentId?: string;
  toTournamentDivisionId?: string;
  createdAt?: string;
  justIgnore?: string;
  status?: string;
};
const teaminvitationSearchAbleFields = ["justIgnore"];

const getTeaminvitationList = async (
  options: IPaginationOptions,
  filters: ITeaminvitationFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.TeaminvitationWhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...teaminvitationSearchAbleFields.map((field) => ({
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
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions: Prisma.TeaminvitationWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.teaminvitation.findMany({
    skip,
    take: limit,
    where: whereConditions,
    include: {
      toTournament: { select: { id: true, name: true } },
      toDivision: { select: { id: true, divisionName: true } },
      invitedTeams: {
        include: {
          team: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const total = await prisma.teaminvitation.count({ where: whereConditions });

  return {
    meta: { total, page, limit },
    data: result,
  };
};

// get Teaminvitation by user id
const getTeaminvitationByUserId = async (userId: string) => {
  const result = await prisma.teaminvitation.findMany({
    where: {
      userId,
    },
    include: {
      toTournament: true,
      toDivision: true,
      invitedTeams: {
        include: {
          team: true,
        },
      },
    },
  });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Teaminvitation not found");
  }

  return result;
};

// get Teaminvitation by id
const getTeaminvitationById = async (id: string) => {
  const existingTeaminvitation = await prisma.teaminvitation.findUnique({
    where: { id },
  });

  if (!existingTeaminvitation) {
    throw new ApiError(httpStatus.NOT_FOUND, "Teaminvitation not found");
  }

  const result = await prisma.teaminvitation.findMany({
    where: {
      id,
    },
    include: {
      toTournament: true,
      toDivision: true,
      invitedTeams: {
        include: {
          team: true,
        },
      },
    },
  });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Teaminvitation not found");
  }

  return result;
};

// update Teaminvitation
const updateTeaminvitation = async (id: string, data: any) => {
  const existingTeaminvitation = await prisma.teaminvitation.findUnique({
    where: { id },
  });

  if (!existingTeaminvitation) {
    throw new ApiError(httpStatus.NOT_FOUND, "Teaminvitation not found");
  }

  const result = await prisma.teaminvitation.update({
    where: { id },
    data,
  });

  return result;
};

// delete Teaminvitation
const deleteTeaminvitation = async (id: string) => {
  const result = await prisma.teaminvitation.delete({ where: { id } });

  return result;
};

// get all Teaminvitation for coach
const getInvitationsForCoach = async (
  coachId: string,
  options: IPaginationOptions,
  filters?: { status?: InviteStatus },
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);

  const where: Prisma.TeaminvitationWhereInput = {
    ...(filters?.status ? { status: filters.status } : {}),
    invitedTeams: {
      some: {
        team: { coachId },
      },
    },
  };

  const [result, total] = await prisma.$transaction([
    prisma.teaminvitation.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        invitedTeams: {
          include: {
            team: {
              select: { id: true, teamName: true, image: true, coachId: true },
            },
          },
        },
        toTournament: {
          select: { id: true, name: true, registrationDeadline: true },
        },
        toDivision: { select: { id: true, divisionName: true } },
      },
    }),
    prisma.teaminvitation.count({ where }),
  ]);

  return {
    meta: { total, page, limit },
    data: result,
  };
};

// respond to invitation
const respondToInvitation = async (
  invitationId: string,
  coachId: string,
  action: "ACCEPT" | "DECLINE",
) => {
  const invitation = await prisma.teaminvitation.findFirst({
    where: { id: invitationId },
    include: {
      invitedTeams: {
        include: {
          team: {
            select: { id: true, teamName: true, image: true, coachId: true },
          },
        },
      },
      toDivision: {
        select: {
          id: true,
          tournamentId: true,
          divisionName: true,
          slotsLeft: true,
        },
      },
      toTournament: {
        select: { id: true, name: true, youthFee: true, adultFee: true },
      },
    },
  });

  if (!invitation)
    throw new ApiError(httpStatus.NOT_FOUND, "Invitation not found");

  const invitedTeam = invitation.invitedTeams?.[0]?.team;
  if (!invitedTeam)
    throw new ApiError(httpStatus.BAD_REQUEST, "Invitation has no team");

  if (invitedTeam.coachId !== coachId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      "You are not allowed to respond to this invitation",
    );
  }

  if (invitation.status !== "PENDING") {
    throw new ApiError(httpStatus.CONFLICT, "Invitation already responded");
  }

  if (action === "DECLINE") {
    const updated = await prisma.teaminvitation.update({
      where: { id: invitation.id },
      data: { status: InviteStatus.DECLINED },
    });

    return { message: "Invitation declined", data: updated };
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingReg = await tx.teamregistration.findFirst({
      where: {
        tournamentId: invitation.toTournamentId,
        teamDivisionId: invitation.toTournamentDivisionId,
        teamId: invitedTeam.id,
      },
      select: { id: true },
    });

    if (existingReg) {
      throw new ApiError(
        httpStatus.CONFLICT,
        "Team already registered in this tournament division",
      );
    }

    if (
      typeof invitation.toDivision.slotsLeft === "number" &&
      invitation.toDivision.slotsLeft <= 0
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "No slots left in this division",
      );
    }

    const registration = await tx.teamregistration.create({
      data: {
        teamId: invitedTeam.id,
        userId: coachId,
        tournamentId: invitation.toTournamentId,
        teamDivisionId: invitation.toTournamentDivisionId,
        teamName: invitedTeam.teamName,
        image: invitedTeam.image,
        registrationPayStatus: "PENDING",
        maxPlayers: 0,
        totalRegisteredPlayers: 0,
      } as any,
      select: {
        id: true,
        tournamentId: true,
        teamDivisionId: true,
        teamId: true,
      },
    });

    const updatedInvite = await tx.teaminvitation.update({
      where: { id: invitation.id },
      data: { status: InviteStatus.ACCEPTED },
      select: { id: true, status: true },
    });

    await tx.tournamentDivision
      .update({
        where: { id: invitation.toTournamentDivisionId },
        data: { slotsLeft: { decrement: 1 } },
      })
      .catch(() => null);

    await tx.tournament
      .update({
        where: { id: invitation.toTournamentId },
        data: { totalRegisteredTeams: { increment: 1 } },
      })
      .catch(() => null);

    return { updatedInvite, registration };
  });

  return {
    message: "Invitation accepted and team registered",
    data: result,
  };
};

export const teaminvitationService = {
  createTeaminvitation,
  getTeaminvitationList,
  getTeaminvitationByUserId,
  getTeaminvitationById,
  updateTeaminvitation,
  deleteTeaminvitation,
  getInvitationsForCoach,
  respondToInvitation,
};
