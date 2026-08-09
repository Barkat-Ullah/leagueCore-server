import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import { Request } from "express";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { getEffectiveAccessId } from "../../middlewares/access";
import { inviteUserEmail } from "../../../shared/emailHTML";
import { enqueueEmail } from "../../../shared/emailSender";

const addPlayer = async (req: Request) => {
  const coachId = await getEffectiveAccessId(req.user.id);
  const data = req.body;
  const existingUser = await prisma.user.findFirst({
    where: {
      email: data.email,
    },
  });

  if (existingUser) {
    if (existingUser.email === data.email) {
      throw new ApiError(
        400,
        `User with this email ${data.email} already exists`,
      );
    }
  }
  const hashedPassword = await bcrypt.hash(
    data.password,
    Number(process.env.BCRYPT_SALT_ROUNDS || 10),
  );
  const created = await prisma.user.create({
    data: {
      fullName: data.fullName,
      email: data.email || null,
      phoneNumber: data.phone || null,
      role: UserRole.PLAYER,
      dob: data.dob ? new Date(data.dob) : null,
      jerseyNum: data.jerseyNum,
      createdById: coachId,
      password: hashedPassword,
    },
  });

  const html = inviteUserEmail(created?.fullName as string, data.password);
  await enqueueEmail({ to: created.email, subject: "Player Account Invitation", html });

  return created;
};
const playerDashboard = async (req: Request) => {
  const playerId = req.user.id;

  const player = await prisma.user.findUnique({
    where: {
      id: playerId,
    },
  });

  const teamPlayer = await prisma.teamplayer.findFirst({
    where: { playerId },
    select: {
      id: true,
      status: true,
      ageVerified: true,
      isAgree: true,
      signName: true,
      signedAt: true,
      player: {
        select: {
          id: true,
          jerseyNum: true,
          fullName: true,
          email: true,
          profileImage: true,
          dob: true,
          role: true,
          status: true,
        },
      },
      team: {
        select: {
          teamName: true,
          image: true,
          tourDivision: {
            select: {
              divisionName: true,
            },
          },
          tournament: {
            select: {
              id: true,
              name: true,
              location: true,
            },
          },
        },
      },
    },
  });

  const teamRegistrationId = teamPlayer?.team
    ? await prisma.teamregistration.findFirst({
        where: {
          teamName: teamPlayer.team.teamName,
        },
        select: { id: true, tournamentId: true },
      })
    : null;

  let nextMatch = null;
  if (teamRegistrationId) {
    nextMatch = await prisma.match.findFirst({
      where: {
        OR: [
          { homeTeamId: teamRegistrationId.id },
          { awayTeamId: teamRegistrationId.id },
        ],
        status: { in: ["SCHEDULED", "PUBLISHED"] },
        scheduledAt: { gte: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      select: {
        id: true,
        scheduledAt: true,
        field: true,
        status: true,
        stage: true,
        round: true,
        homeTeam: {
          select: {
            teamName: true,
            image: true,
          },
        },
        awayTeam: {
          select: {
            teamName: true,
            image: true,
          },
        },
        tournament: {
          select: {
            name: true,
            location: true,
            mapLink: true,
          },
        },
        division: {
          select: {
            divisionName: true,
          },
        },
        referee: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  let opponent = null;
  if (nextMatch && teamRegistrationId) {
    const isHome = nextMatch.homeTeam.teamName === teamPlayer!.team?.teamName;
    opponent = isHome ? nextMatch.awayTeam : nextMatch.homeTeam;
  }

  return {
    playerPass: {
      teamPlayerId: teamPlayer?.id,
      fullName: teamPlayer?.player.fullName ?? player?.fullName,
      email: teamPlayer?.player.email ?? player?.email,
      profileImage: teamPlayer?.player.profileImage ?? player?.profileImage,
      dob: teamPlayer?.player.dob ?? player?.dob,
      division: teamPlayer?.team?.tourDivision?.divisionName ?? null,
      teamName: teamPlayer?.team?.teamName ?? null,
      jerseyNum: teamPlayer?.player.jerseyNum ?? player?.jerseyNum,
      role: teamPlayer?.player.role ?? player?.role,
      // isVerified:
      //   teamPlayer.ageVerified === "verified" && teamPlayer.status === "Signed",
      ageVerifiedStatus: teamPlayer?.ageVerified ?? "Check_in_required",
    },
    waiver: {
      status: teamPlayer?.status ?? "None",
      isAgree: teamPlayer?.isAgree ?? false,
    },

    nextMatch: nextMatch
      ? {
          id: nextMatch.id,
          scheduledAt: nextMatch.scheduledAt,
          field: nextMatch.field,
          location: nextMatch.tournament.location,
          mapLink: nextMatch.tournament.mapLink,
          tournamentName: nextMatch.tournament.name,
          division: nextMatch.division.divisionName,
          stage: nextMatch.stage,
          round: nextMatch.round,
          opponent: {
            teamName: opponent?.teamName ?? null,
            image: opponent?.image ?? null,
          },
          referee: nextMatch.referee?.name ?? null,
          status: nextMatch.status,
        }
      : null,
  };
};
const playerSchedule = async (req: Request) => {
  const playerId = req.user.id;
  const teamPlayer = await prisma.teamplayer.findFirst({
    where: { playerId },
    select: {
      teamregistrationId: true,
      team: {
        select: {
          id: true,
          teamName: true,
          image: true,
        },
      },
    },
  });

  if (!teamPlayer) {
    throw new ApiError(404, "Player not found or not registered in any team");
  }

  const teamRegistrationId = teamPlayer.teamregistrationId;
  const myTeamName = teamPlayer.team.teamName;
  const now = new Date();

  const matchSelect = {
    id: true,
    scheduledAt: true,
    field: true,
    homeScore: true,
    awayScore: true,
    stage: true,
    round: true,
    status: true,
    homeTeam: {
      select: {
        id: true,
        teamName: true,
        image: true,
      },
    },
    awayTeam: {
      select: {
        id: true,
        teamName: true,
        image: true,
      },
    },
    tournament: {
      select: {
        name: true,
        location: true,
        mapLink: true,
      },
    },
    division: {
      select: {
        divisionName: true,
      },
    },
  };

  const [upcomingMatches, pastMatches] = await Promise.all([
    prisma.match.findMany({
      where: {
        OR: [
          { homeTeamId: teamRegistrationId },
          { awayTeamId: teamRegistrationId },
        ],
        status: { in: ["SCHEDULED", "PUBLISHED"] },
        scheduledAt: { gte: now },
      },
      orderBy: { scheduledAt: "asc" },
      select: matchSelect,
    }),

    prisma.match.findMany({
      where: {
        OR: [
          { homeTeamId: teamRegistrationId },
          { awayTeamId: teamRegistrationId },
        ],
        status: "COMPLETED",
        scheduledAt: { lt: now },
      },
      orderBy: { scheduledAt: "desc" },
      select: matchSelect,
    }),
  ]);

  const formatMatch = (match: (typeof upcomingMatches)[number]) => {
    const isHome = match.homeTeam.teamName === myTeamName;
    const opponent = isHome ? match.awayTeam : match.homeTeam;
    const myScore = isHome ? match.homeScore : match.awayScore;
    const opponentScore = isHome ? match.awayScore : match.homeScore;

    let result: string | null = null;
    let resultType: "win" | "loss" | "draw" | null = null;

    if (myScore !== null && opponentScore !== null) {
      if (myScore > opponentScore) {
        result = `Won ${myScore}-${opponentScore}`;
        resultType = "win";
      } else if (myScore < opponentScore) {
        result = `Lost ${myScore}-${opponentScore}`;
        resultType = "loss";
      } else {
        result = `Draw ${myScore}-${opponentScore}`;
        resultType = "draw";
      }
    }

    return {
      id: match.id,
      scheduledAt: match.scheduledAt,
      field: match.field,
      location: match.tournament.location,
      mapLink: match.tournament.mapLink,
      tournamentName: match.tournament.name,
      division: match.division.divisionName,
      stage: match.stage,
      round: match.round,
      status: match.status,
      opponent: {
        id: opponent.id,
        teamName: opponent.teamName,
        image: opponent.image,
      },
      score:
        myScore !== null && opponentScore !== null
          ? { mine: myScore, opponent: opponentScore }
          : null,
      result,
      resultType,
    };
  };

  return {
    teamName: myTeamName,
    teamImage: teamPlayer.team.image,
    upcomingMatches: upcomingMatches.map(formatMatch),
    pastMatches: pastMatches.map(formatMatch),
  };
};

type IPlayerFilterRequest = {
  searchTerm?: string;
  createdAt?: string;
  status?: string;
  ageVerified?: string;
};
const getAllPlayer = async (
  options: IPaginationOptions,
  filters: IPlayerFilterRequest,
  req: Request,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, createdAt, ...filterData } = filters;
  const coachId = await getEffectiveAccessId(req.user.id);

  const andConditions: Prisma.UserWhereInput[] = [];

  andConditions.push({
    createdById: coachId,
    role: UserRole.PLAYER,
    isDeleted: false,
  });

  if (searchTerm?.trim()) {
    andConditions.push({
      OR: [
        { fullName: { contains: searchTerm.trim(), mode: "insensitive" } },
        { email: { contains: searchTerm.trim(), mode: "insensitive" } },
        { jerseyNum: { contains: searchTerm.trim(), mode: "insensitive" } },
      ],
    });
  }

  if (createdAt) {
    const start = new Date(createdAt);
    start.setHours(0, 0, 0, 0);
    const end = new Date(createdAt);
    end.setHours(23, 59, 59, 999);
    andConditions.push({ createdAt: { gte: start, lte: end } });
  }

  Object.entries(filterData).forEach(([key, value]) => {
    if (value == null || value === "") return;
    andConditions.push({ [key]: value });
  });

  const where: Prisma.UserWhereInput = { AND: andConditions };

  const [players, total] = await Promise.all([
    prisma.user.findMany({
      skip,
      take: limit,
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        phoneNumber: true,
        profileImage: true,
        jerseyNum: true,
        dob: true,
        status: true,
        createdAt: true,
        teamMemberships: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            status: true,
            ageVerified: true,
            isAgree: true,
            signedAt: true,
            team: {
              select: {
                id: true,
                teamName: true,
                tournament: {
                  select: {
                    id: true,
                    name: true,
                    startDate: true,
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  // ── Flatten for clean frontend consumption ──────────────────────────
  const formatted = players.map((player) => {
    const latestMembership = player.teamMemberships[0] ?? null;

    return {
      id: player.id,
      fullName: player.fullName,
      email: player.email,
      phoneNumber: player.phoneNumber,
      profileImage: player.profileImage,
      jerseyNum: player.jerseyNum,
      dob: player.dob,
      status: player.status,
      createdAt: player.createdAt,
      waiverStatus: latestMembership?.status ?? "Pending",
      ageVerified: latestMembership?.ageVerified ?? "Check_in_required",
      isAgree: latestMembership?.isAgree ?? false,
      signedAt: latestMembership?.signedAt ?? null,
      tournament: latestMembership
        ? {
            id: latestMembership.team.tournament.id,
            name: latestMembership.team.tournament.name,
            startDate: latestMembership.team.tournament.startDate,
            teamId: latestMembership.team.id,
            teamName: latestMembership.team.teamName,
          }
        : null,
    };
  });

  return {
    meta: { total, page, limit },
    data: formatted,
  };
};

export const playerService = {
  playerDashboard,
  playerSchedule,
  getAllPlayer,
  addPlayer,
};
