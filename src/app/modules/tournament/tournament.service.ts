import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { Division, Prisma, TournamentStage, TournamentStatus, UserRole } from "@prisma/client";
import { fileUploader } from "../../../helpars/fileUploader";
import { buildAllPairs, buildDailySlots, clampDiscount, computeGroupStandings, getDefaultDiscount, highestPowerOfTwoLE, isAdultDivision, StandingStatusBadge, syncPlayoffsFromStandings, winBonusByStage } from "../../../helpars/tourUtils";
import { editMatchSchema } from "./tournament.validation";
import { awardSeriesPointsForTournament } from "../../../helpars/awardPoints";
import { getAdminId } from "../../../shared/getAdminId";
import { subDays, isBefore } from "date-fns";

// create Tournament
const YOUTH_DIVISIONS = new Set<Division>([
  "U9_BOYS",
  "U10_BOYS",
  "U9_GIRLS",
  "U10_GIRLS",
  "U11_BOYS",
  "U11_GIRLS",
  "U12_BOYS",
  "U12_GIRLS",
  "U13_BOYS",
  "U14_BOYS",
  "U13_GIRLS",
  "U14_GIRLS",
  "U15_BOYS",
  "U16_BOYS",
  "U15_GIRLS",
  "U16_GIRLS",
]);

const ADULT_DIVISIONS = new Set<Division>([
  "U17_BOYS",
  "U18_BOYS",
  "U17_GIRLS",
  "U18_GIRLS",
  "HS_BOYS",
  "HS_GIRLS",
  "MENS_DIV_1",
  "MENS_DIV_2",
  "MENS_DIV_3",
  "WOMENS",
  "COED",
]);

const createTournament = async (req: any, userId: string) => {
  const file = req.file;
  const data = req.body;
  let image = "";

  console.log(data, file);

  const adminId = await getAdminId();
  const user = await prisma.user.findUnique({ where: { id: userId, role: "ADMIN" } });
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Admin not found');
  }

  if (file) {
    image = (await fileUploader.uploadToCloudinary(file)).Location;
  }

  const latestAllowedDeadline = subDays(data.startDate, 7);

  if (!isBefore(data.registrationDeadline, latestAllowedDeadline)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "Registration deadline must be at least 7 days before the start date"
    );
  }

  const result = await prisma.tournament.create({
    data: {
      userId,
      tournamentStage: data.tournamentStage,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      location: data.location,
      mapLink: data.mapLink,
      registrationDeadline: data.registrationDeadline,
      numberOfFields: data.numberOfFields,
      youthFee: data.youthFee,
      adultFee: data.adultFee,
      notes: data.notes,
      gameStyle: data.gameStyle,
      rosterSizeMax: data.rosterSizeMax,
      logo: image,
      status: data.status,
      bathrooms: data.bathrooms,
      foods: data.foods,
      parking: data.parking,
      prizePool: data.prizePool,
    }
  });

  console.log(result);

  if (Array.isArray(data.divisions) && data.divisions.length > 0) {
    const youthFee = Number(data.youthFee);
    const adultFee = Number(data.adultFee);

    await prisma.tournamentDivision.createMany({
      data: data.divisions.map((division: any) => {
        const maxTeams = Number(division.maxTeams);
        const divisionName = division.divisionName as Division;

        // pick fee based on division type
        const fee =
          YOUTH_DIVISIONS.has(divisionName) ? youthFee :
            ADULT_DIVISIONS.has(divisionName) ? adultFee :
              0;

        // ✅ revenue auto-calc (can be replaced later by feeOverride logic)
        const revenue = fee * maxTeams;

        return {
          tournamentId: result.id,
          divisionName,
          maxTeams,
          slotsLeft: maxTeams,
          revenue,
        };
      }),
    });
  }

  await prisma.activityLog.create({
    data: {
      userId: adminId!,
      title: "New Tournament Created",
      content: `Tournament "${result.name}" has been created`,
    }
  });

  return result;
};

// get all Tournament
type ITournamentFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  tournamentStage?: TournamentStage
  name?: string;
  startDate?: Date;
  endDate?: Date;
  location?: string;
  registrationDeadline?: Date;
  numberOfFields?: number;
  youthFee?: number;
  adultFee?: number;
  status?: TournamentStatus;
  isDeleted?: boolean;
  gameStyle?: string;
  divisionName?: Division;
  maxTeams?: number;
};
const tournamentSearchAbleFields = ['name', 'location'];

const getTournamentList = async (
  options: IPaginationOptions,
  filters: ITournamentFilterRequest,
  userId?: string,
  userRole?: UserRole,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.TournamentWhereInput[] = [];

  if (userRole === "ADMIN") {
    andConditions.push({
      userId,
      tournamentStage: { in: ["PROVING", "CROWN", "ROYAL"] },
      isDeleted: false,
    });
  } else {
    andConditions.push({
      isDeleted: false,
      OR: [
        {
          tournamentStage: "PROVING",
          registrationDeadline: { gte: new Date() },
        },
        {
          teaminvitations: {
            some: {
              status: "PENDING",
              invitedTeams: {
                some: {
                  status: "PENDING",
                  team: { coachId: userId },
                },
              },
              toTournament: { registrationDeadline: { gte: new Date() } }
            },
          },
        },
      ],
    });
  }

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...tournamentSearchAbleFields.map((field) => ({
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
      if (["createdAt", "startDate", "endDate", "registrationDeadline"].includes(key) && value) {
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

  const whereConditions: Prisma.TournamentWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.tournament.findMany({
    skip,
    take: limit,
    where: whereConditions,
    include: {
      tournamentDivisions: true,
    },
    orderBy: { startDate: "asc" },
  });

  const total = await prisma.tournament.count({ where: whereConditions });

  return {
    meta: { total, page, limit },
    data: result,
  };
};

// get Tournament by id for admin
const getTournamentByIdByAdmin = async (id: string) => {
  const tournament = await prisma.tournament.findFirst({
    where: { id, isDeleted: false },
    include: { tournamentDivisions: true },
  });

  if (!tournament) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament not found");
  }

  // ✅ divisions stats
  const totalDivisions = await prisma.tournamentDivision.count({
    where: { tournamentId: id },
  });

  const activeDivisions = await prisma.tournamentDivision.count({
    where: { tournamentId: id, status: "ACTIVE" },
  });

  // ✅ teams stats
  const totalTeams = await prisma.teamregistration.count({
    where: { tournamentId: id },
  });

  // ✅ revenue (derived): PAID teams only
  const paidTeams = await prisma.teamregistration.findMany({
    where: { tournamentId: id, registrationPayStatus: "PAID" },
    select: {
      tourDivision: { select: { feeOverride: true, divisionName: true } },
    },
  });

  const totalRevenue = paidTeams.reduce((sum, tr) => {
    const override = tr.tourDivision.feeOverride;
    if (typeof override === "number") return sum + override;

    const fee = isAdultDivision(tr.tourDivision.divisionName)
      ? tournament.adultFee
      : tournament.youthFee;

    return sum + (typeof fee === "number" ? fee : 0);
  }, 0);

  return {
    stats: {
      totalDivisions,
      activeDivisions,
      totalTeams,
      totalRevenue,
    },
    data: tournament,
  };
};

// update Tournament
const updateTournament = async (id: string, req: any) => {
  const file = req.file;
  const data = req.body;
  let image;

  const existingTournament = await prisma.tournament.findUnique({ where: { id } });

  if (!existingTournament) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tournament not found');
  }

  if (file) {
    image = (await fileUploader.uploadToCloudinary(file)).Location;
  }

  const result = await prisma.tournament.update({
    where: { id },
    data: {
      tournamentStage: data.tournamentStage ?? existingTournament.tournamentStage,
      name: data.name ?? existingTournament.name,
      startDate: data.startDate ?? existingTournament.startDate,
      endDate: data.endDate ?? existingTournament.endDate,
      location: data.location ?? existingTournament.location,
      mapLink: data.mapLink ?? existingTournament.mapLink,
      registrationDeadline: data.registrationDeadline ?? existingTournament.registrationDeadline,
      numberOfFields: data.numberOfFields ?? existingTournament.numberOfFields,
      youthFee: data.youthFee ?? existingTournament.youthFee,
      adultFee: data.adultFee ?? existingTournament.adultFee,
      notes: data.notes ?? existingTournament.notes,
      gameStyle: data.gameStyle ?? existingTournament.gameStyle,
      rosterSizeMax: data.rosterSizeMax ?? existingTournament.rosterSizeMax,
      logo: image ?? existingTournament.logo,
      status: data.status ?? existingTournament.status,
      bathrooms: data.bathrooms ?? existingTournament.bathrooms,
      foods: data.foods ?? existingTournament.foods,
      parking: data.parking ?? existingTournament.parking,
      prizePool: data.prizePool ?? existingTournament.prizePool,
    }
  });

  if (existingTournament.status !== "COMPLETED" && data.status === "COMPLETED") {
    await awardSeriesPointsForTournament(result.id);
  }


  if (Array.isArray(data.divisions) && data.divisions.length > 0) {
    const youthFee = Number(data.youthFee ?? existingTournament.youthFee);
    const adultFee = Number(data.adultFee ?? existingTournament.adultFee);

    for (const division of data.divisions) {
      const maxTeams = Number(division.maxTeams);
      const divisionName = division.divisionName as Division;

      // pick fee based on division type
      const fee =
        YOUTH_DIVISIONS.has(divisionName) ? youthFee :
          ADULT_DIVISIONS.has(divisionName) ? adultFee :
            0;

      const revenue = fee * maxTeams;

      if (division.id) {
        await prisma.tournamentDivision.update({
          where: { id: division.id },
          data: {
            divisionName,
            maxTeams,
            revenue,
          }
        });
      } else {
        // Fallback: check if division exists by name to avoid duplicates
        const existingDiv = await prisma.tournamentDivision.findFirst({
          where: { tournamentId: id, divisionName }
        });

        if (existingDiv) {
          await prisma.tournamentDivision.update({
            where: { id: existingDiv.id },
            data: { maxTeams, revenue }
          });
        } else {
          await prisma.tournamentDivision.create({
            data: {
              tournamentId: id,
              divisionName,
              maxTeams,
              slotsLeft: maxTeams,
              revenue,
            }
          });
        }
      }
    }
  } else if (data.divisionName && data.maxTeams) {
    // Fallback for backwards compatibility if a single division was passed
    await prisma.tournamentDivision.updateMany({
      where: { tournamentId: id },
      data: {
        divisionName: data.divisionName,
        maxTeams: data.maxTeams,
      }
    });
  }

  return result;
};

// delete Tournament
const deleteTournament = async (id: string) => {
  const result = await prisma.tournament.update({ where: { id }, data: { isDeleted: true } });
  return result;
};

// delete Tournament Division
const deleteTournamentDivision = async (id: string) => {
  const existingDivision = await prisma.tournamentDivision.findUnique({ where: { id } });
  if (!existingDivision) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Tournament Division not found');
  }
  const result = await prisma.tournamentDivision.delete({ where: { id } });
  return result;
};

// get all Teamregistration for admin
type ITeamregistrationFilterRequest = {
  searchTerm?: string;
  teamName?: string;
};
const teamregistrationSearchAbleFields = ["teamName"];

const getTeamsUnderDivision = async (
  teamDivisionId: string,
  options: IPaginationOptions,
  filters: ITeamregistrationFilterRequest
) => {
  const exitingDivision = await prisma.tournamentDivision.findUnique({
    where: { id: teamDivisionId },
  });

  if (!exitingDivision) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament Division not found");
  }

  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.TeamregistrationWhereInput[] = [];

  andConditions.push({ teamDivisionId });

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...teamregistrationSearchAbleFields.map((field) => ({
          [field]: {
            contains: searchTerm,
            mode: "insensitive",
          },
        })),
        {
          coach: {
            fullName: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        },
        {
          coach: {
            email: {
              contains: searchTerm,
              mode: "insensitive",
            },
          },
        },
        {
          teamplayers: {
            some: {
              player: {
                fullName: {
                  contains: searchTerm,
                  mode: "insensitive",
                },
              },
            },
          },
        },
      ],
    });
  }

  if (filterData.teamName) {
    andConditions.push({
      teamName: {
        contains: filterData.teamName,
        mode: "insensitive",
      },
    });
  }

  const whereConditions: Prisma.TeamregistrationWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.teamregistration.findMany({
    skip,
    take: limit,
    where: whereConditions,
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          teamplayers: {
            where: { status: "Signed" },
          },
        },
      },
      coach: { select: { id: true, fullName: true, phoneNumber: true, email: true } },
      teamplayers: true,
    },
  });

  const data = result.map((team) => ({
    signedPlayersCount: team._count.teamplayers,
    ...team,
    _count: undefined as never,
  }));

  const total = await prisma.teamregistration.count({ where: whereConditions });

  return {
    meta: { total, page, limit },
    data,
  };
};

// Generate Division Schedule (NO team conflicts, accurate capacity)
const generateDivisionSchedule = async (divisionId: string) => {
  const DAILY_START_HOUR = 9;
  const DAILY_END_HOUR = 18;
  const SLOT_STEP_MINUTES = 90;

  const division = await prisma.tournamentDivision.findFirst({
    where: { id: divisionId },
    include: { tournament: true },
  });

  if (!division) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament Division not found");
  }

  const tournament = division.tournament;
  const fieldCount = Math.max(1, tournament.numberOfFields || 1);

  // ✅ Always wipe existing GROUP schedule
  await prisma.match.deleteMany({ where: { divisionId, stage: "GROUP" } });

  const teams = await prisma.teamregistration.findMany({
    where: { teamDivisionId: divisionId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  const teamIds = teams.map((t) => t.id);

  if (teamIds.length < 2) {
    throw new ApiError(httpStatus.BAD_REQUEST, "Not enough teams to generate schedule");
  }

  // Double round robin fixtures
  const remaining = buildAllPairs(teamIds);

  // tournament date range (midnight boundaries)
  const startDay = new Date(tournament.startDate);
  startDay.setHours(0, 0, 0, 0);

  const endDay = new Date(tournament.endDate);
  endDay.setHours(0, 0, 0, 0);

  const totalDays =
    Math.floor((endDay.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  // ✅ Max matches possible in one slot without repeating a team:
  const maxMatchesPerSlot = Math.floor(teamIds.length / 2);

  // ✅ Effective number of simultaneous matches we can run (fields beyond this can't be used safely)
  const effectiveFields = Math.min(fieldCount, maxMatchesPerSlot);

  // build slots for a day (count only)
  const slotsPerDay = buildDailySlots({
    date: startDay,
    dailyStartHour: DAILY_START_HOUR,
    dailyEndHour: DAILY_END_HOUR,
    slotStepMinutes: SLOT_STEP_MINUTES,
    fieldCount,
  }).length;

  // ✅ Accurate capacity (use effectiveFields, NOT fieldCount)
  const totalCapacity = totalDays * slotsPerDay * effectiveFields;

  if (totalCapacity < remaining.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Not enough slots between tournament start/end to schedule all matches. Capacity=${totalCapacity}, Matches=${remaining.length}`
    );
  }

  const matchesToCreate: Array<{
    tournamentId: string;
    divisionId: string;
    homeTeamId: string;
    awayTeamId: string;
    scheduledAt: Date;
    field: string;
    stage: "GROUP";
    status: "SCHEDULED";
    isPublished: boolean;
  }> = [];

  // ✅ Schedule loop
  for (
    let day = new Date(startDay);
    day.getTime() <= endDay.getTime();
    day.setDate(day.getDate() + 1)
  ) {
    if (remaining.length === 0) break;

    const slots = buildDailySlots({
      date: day,
      dailyStartHour: DAILY_START_HOUR,
      dailyEndHour: DAILY_END_HOUR,
      slotStepMinutes: SLOT_STEP_MINUTES,
      fieldCount,
    });

    for (const slot of slots) {
      if (remaining.length === 0) break;

      const usedInSlot = new Set<string>();

      // ✅ Only use the safe number of fields for this slot
      const fieldsToUse = slot.fields.slice(0, effectiveFields);

      for (const fieldName of fieldsToUse) {
        if (remaining.length === 0) break;

        // Find next match that doesn't reuse a team within the slot
        const idx = remaining.findIndex(
          (m) => !usedInSlot.has(m.home) && !usedInSlot.has(m.away)
        );

        // ✅ If no safe match exists for this slot, stop filling more fields in this slot
        if (idx === -1) break;

        const match = remaining.splice(idx, 1)[0];

        usedInSlot.add(match.home);
        usedInSlot.add(match.away);

        matchesToCreate.push({
          tournamentId: tournament.id,
          divisionId,
          homeTeamId: match.home,
          awayTeamId: match.away,
          scheduledAt: new Date(slot.scheduledAt),
          field: fieldName,
          stage: "GROUP",
          status: "SCHEDULED",
          isPublished: false,
        });
      }
    }
  }

  // Sanity: should always match
  if (matchesToCreate.length !== buildAllPairs(teamIds).length) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Schedule generation incomplete. Created=${matchesToCreate.length}, Expected=${buildAllPairs(teamIds).length}`
    );
  }

  await prisma.match.createMany({ data: matchesToCreate });

  const adminId = await getAdminId();

  if (adminId) {
    await prisma.activityLog.create({
      data: {
        userId: adminId,
        title: "Division Schedule Generated",
        content: `Schedule generated for Division "${division.divisionName}" of Tournament "${tournament.name}".`,
      },
    });
  }

  return {
    message: "Schedule generated successfully (double round-robin, tournament date range)",
    createdMatches: matchesToCreate.length,
    meta: {
      fields: fieldCount,
      effectiveFields,
      slotStepMinutes: SLOT_STEP_MINUTES,
      dailyStartHour: DAILY_START_HOUR,
      dailyEndHour: DAILY_END_HOUR,
      tournamentStart: tournament.startDate,
      tournamentEnd: tournament.endDate,
      teams: teamIds.length,
      totalFixtures: matchesToCreate.length,
    },
  };
};

// get Division Schedule Data
const getDivisionScheduleData = async (divisionId: string, options: IPaginationOptions) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);

  const division = await prisma.tournamentDivision.findFirst({
    where: { id: divisionId },
    include: {
      tournament: { select: { id: true, name: true } },
    },
  });

  if (!division) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament Division not found");
  }

  // ---------- STATS ----------
  const teamsRegistered = await prisma.teamregistration.count({
    where: { teamDivisionId: divisionId },
  });

  const matches = await prisma.match.count({ where: { divisionId } });

  const distinctFields = await prisma.match.findMany({
    where: { divisionId, field: { not: null } },
    distinct: ["field"],
    select: { field: true },
  });

  const stats = {
    teamsRegistered,
    teamsMax: division.maxTeams,
    matches,
    fields: distinctFields.length,
  };

  // ---------- SCHEDULE (GROUP) ----------
  const schedule = await prisma.match.findMany({
    where: { divisionId, stage: "GROUP" },
    skip,
    take: limit,
    orderBy: { scheduledAt: "asc" },
    include: {
      referee: { select: { id: true, name: true, email: true } },
      homeTeam: { select: { id: true, teamName: true, image: true } },
      awayTeam: { select: { id: true, teamName: true, image: true } },
    },
  });

  const scheduleTotal = await prisma.match.count({
    where: { divisionId, stage: "GROUP" },
  });

  // ---------- BRACKETS ----------
  const brackets = await prisma.match.findMany({
    where: { divisionId, stage: { in: ["QUARTER_FINAL", "SEMI_FINAL", "FINAL"] } },
    orderBy: [{ stage: "asc" }, { round: "asc" }, { scheduledAt: "asc" }],
    include: {
      referee: { select: { id: true, name: true } },
      homeTeam: { select: { id: true, teamName: true, image: true } },
      awayTeam: { select: { id: true, teamName: true, image: true } },
    },
  });

  return {
    division,
    stats,
    schedule: { meta: { total: scheduleTotal, page, limit }, data: schedule },
    brackets,
  };
};

// Edit Match Schedule (with collision checks and publish guard)
const editMatchSchedule = async (matchId: string, payload: any) => {
  const parsed = editMatchSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      parsed.error.issues.map((i) => i.message).join(", ")
    );
  }

  const existing = await prisma.match.findFirst({
    where: { id: matchId },
    select: {
      id: true,
      divisionId: true,
      tournamentId: true,
      stage: true,
      isPublished: true,
      status: true,
      scheduledAt: true,
      field: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
    },
  });

  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, "Match not found");

  const nextScheduledAt =
    parsed.data.scheduledAt !== undefined
      ? new Date(parsed.data.scheduledAt)
      : existing.scheduledAt;

  const nextField =
    parsed.data.field !== undefined ? parsed.data.field : existing.field;

  const nextHomeTeamId =
    parsed.data.homeTeamId !== undefined
      ? parsed.data.homeTeamId
      : existing.homeTeamId;

  const nextAwayTeamId =
    parsed.data.awayTeamId !== undefined
      ? parsed.data.awayTeamId
      : existing.awayTeamId;

  if (nextHomeTeamId === nextAwayTeamId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      "homeTeam and awayTeam cannot be the same"
    );
  }

  const scheduledAtChanged = parsed.data.scheduledAt !== undefined;
  const fieldChanged = parsed.data.field !== undefined;
  const teamsChanged =
    parsed.data.homeTeamId !== undefined || parsed.data.awayTeamId !== undefined;

  if (teamsChanged) {
    const teamIds = [nextHomeTeamId, nextAwayTeamId];
    const count = await prisma.teamregistration.count({
      where: { id: { in: teamIds }, teamDivisionId: existing.divisionId },
    });

    if (count !== 2) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Both teams must belong to the same division"
      );
    }
  }

  // Field collision check (only if time/field changed)
  if (nextScheduledAt && nextField && (scheduledAtChanged || fieldChanged)) {
    const fieldCollision = await prisma.match.findFirst({
      where: {
        id: { not: matchId },
        divisionId: existing.divisionId,
        scheduledAt: nextScheduledAt,
        field: nextField,
      },
      select: { id: true },
    });

    if (fieldCollision) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Field conflict: another match already scheduled on ${nextField} at that time`
      );
    }
  }

  // Team overlap check (only if time/teams changed)
  if (nextScheduledAt && (scheduledAtChanged || teamsChanged)) {
    const teamOverlap = await prisma.match.findFirst({
      where: {
        id: { not: matchId },
        divisionId: existing.divisionId,
        scheduledAt: nextScheduledAt,
        OR: [
          { homeTeamId: nextHomeTeamId },
          { awayTeamId: nextHomeTeamId },
          { homeTeamId: nextAwayTeamId },
          { awayTeamId: nextAwayTeamId },
        ],
      },
      select: { id: true },
    });

    if (teamOverlap) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Team conflict: one of the teams already has a match at the same time"
      );
    }
  }

  // ✅ AUTO-COMPLETE WHEN SCORES ARE UPDATED
  const scoresUpdated =
    parsed.data.homeScore !== undefined || parsed.data.awayScore !== undefined;

  const nextHomeScore =
    parsed.data.homeScore !== undefined
      ? parsed.data.homeScore
      : existing.homeScore;

  const nextAwayScore =
    parsed.data.awayScore !== undefined
      ? parsed.data.awayScore
      : existing.awayScore;

  // If admin is updating score, both scores must be present
  if (scoresUpdated) {
    if (typeof nextHomeScore !== "number" || typeof nextAwayScore !== "number") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Both homeScore and awayScore are required when updating score"
      );
    }
  }

  // ✅ If scores are provided, status is ALWAYS COMPLETED (client doesn't need to send status)
  const nextStatus = scoresUpdated ? "COMPLETED" : (parsed.data.status ?? existing.status);

  // If status is COMPLETED, scores must exist
  if (nextStatus === "COMPLETED") {
    if (typeof nextHomeScore !== "number" || typeof nextAwayScore !== "number") {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "Scores are required to mark match as COMPLETED"
      );
    }
  }

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: {
      scheduledAt:
        parsed.data.scheduledAt !== undefined
          ? new Date(parsed.data.scheduledAt)
          : undefined,
      field: parsed.data.field,
      refereeId: parsed.data.refereeId,
      homeTeamId: parsed.data.homeTeamId,
      awayTeamId: parsed.data.awayTeamId,
      homeScore: parsed.data.homeScore,
      awayScore: parsed.data.awayScore,
      status: nextStatus,
      isPublished: parsed.data.isPublished,
    },
    include: {
      referee: { select: { id: true, name: true, email: true } },
      homeTeam: { select: { id: true, teamName: true, image: true } },
      awayTeam: { select: { id: true, teamName: true, image: true } },
    },
  });

  // ✅ Trigger standings + playoffs ONLY when the match transitions into COMPLETED
  const wasCompleted =
    existing.status === "COMPLETED" &&
    typeof existing.homeScore === "number" &&
    typeof existing.awayScore === "number";

  const nowCompleted =
    updated.status === "COMPLETED" &&
    typeof updated.homeScore === "number" &&
    typeof updated.awayScore === "number";

  const becameCompleted = !wasCompleted && nowCompleted;

  let standings: any[] | undefined;

  // ✅ Group standings only depend on GROUP matches
  if (becameCompleted && updated.stage === "GROUP") {
    standings = await computeGroupStandings(updated.divisionId);
    await syncPlayoffsFromStandings(updated.divisionId, updated.tournamentId, standings);
  }

  // ✅ Notify coaches + managers when score updated
  const uniqIds = (arr: (string | null | undefined)[]) =>
    Array.from(new Set(arr.filter(Boolean) as string[]));

  if (scoresUpdated) {
    const teams = await prisma.teamregistration.findMany({
      where: { id: { in: [updated.homeTeamId, updated.awayTeamId] } },
      select: { userId: true, teamId: true },
    });

    const coachIds = uniqIds(teams.map((t) => t.userId));
    const teamIds = uniqIds(teams.map((t) => t.teamId));

    const managers = teamIds.length
      ? await prisma.teamManager.findMany({
        where: { teamId: { in: teamIds } },
        select: { managerId: true },
      })
      : [];

    const managerIds = uniqIds(managers.map((m) => m.managerId));

    const candidateIds = uniqIds([...coachIds, ...managerIds]);

    if (candidateIds.length) {
      const allowed = await prisma.user.findMany({
        where: {
          id: { in: candidateIds },
          status: "ACTIVE",
          isDeleted: false,
          isTeamUpdateNotify: true,
        },
        select: { id: true },
      });

      const recipientIds = allowed.map((u) => u.id);

      if (recipientIds.length) {
        const title = "Match Score Updated";
        const body = `Score updated: ${updated.homeTeam.teamName} ${updated.homeScore ?? 0} - ${updated.awayScore ?? 0} ${updated.awayTeam.teamName}`;

        await prisma.notification.createMany({
          data: recipientIds.map((userId) => ({
            userId,
            title,
            body,
            data: JSON.stringify({
              type: "MATCH_SCORE_UPDATED",
              matchId: updated.id,
              divisionId: updated.divisionId,
              tournamentId: updated.tournamentId,
              stage: updated.stage,
              scheduledAt: updated.scheduledAt,
              homeTeamId: updated.homeTeamId,
              awayTeamId: updated.awayTeamId,
              homeScore: updated.homeScore,
              awayScore: updated.awayScore,
            }),
          })),
        });
      }
    }
  }

  // ✅ If you want standings in response, return it (optional)
  return {
    message: "Match schedule updated successfully",
    data: updated,
    standings: standings ?? undefined,
  };
};

// Publish Division Schedule (publishes all GROUP matches for a division)
const publishDivisionSchedule = async (divisionId: string) => {
  const division = await prisma.tournamentDivision.findUnique({
    where: { id: divisionId },
    select: {
      id: true,
      divisionName: true,
      teamregistrations: { select: { id: true, userId: true } },
    },
  });

  if (!division) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament Division not found");
  }

  const coachIds = Array.from(
    new Set(division.teamregistrations.map((tr) => tr.userId).filter(Boolean))
  );

  const matches = await prisma.match.findMany({
    where: { divisionId },
    select: {
      id: true,
      scheduledAt: true,
      field: true,
      homeTeamId: true,
      awayTeamId: true,
    },
    orderBy: [{ scheduledAt: "asc" }, { field: "asc" }],
  });

  if (matches.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, "No schedule found to publish");
  }

  // Required fields validation
  for (const m of matches) {
    if (!m.scheduledAt) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot publish: match ${m.id} is missing scheduledAt`
      );
    }
    if (!m.field) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot publish: match ${m.id} is missing field`
      );
    }
    if (!m.homeTeamId || !m.awayTeamId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot publish: match ${m.id} is missing teams`
      );
    }
    if (m.homeTeamId === m.awayTeamId) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot publish: match ${m.id} has same home/away team`
      );
    }
  }

  // Collision validation (in-memory)
  const fieldKeyToMatchId = new Map<string, string>();
  const timeTeamKeyToMatchId = new Map<string, string>();

  for (const m of matches) {
    const timeMs = new Date(m.scheduledAt!).getTime();

    // Field conflict
    const fieldKey = `${timeMs}__${m.field}`;
    const existingFieldMatchId = fieldKeyToMatchId.get(fieldKey);
    if (existingFieldMatchId && existingFieldMatchId !== m.id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot publish: field conflict at ${new Date(timeMs).toISOString()} on ${m.field
        } (matches: ${existingFieldMatchId}, ${m.id})`
      );
    }
    fieldKeyToMatchId.set(fieldKey, m.id);

    // Team conflict
    const homeKey = `${timeMs}__${m.homeTeamId}`;
    const awayKey = `${timeMs}__${m.awayTeamId}`;

    const existingHome = timeTeamKeyToMatchId.get(homeKey);
    if (existingHome && existingHome !== m.id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot publish: team conflict at ${new Date(timeMs).toISOString()} (team ${m.homeTeamId
        }) (matches: ${existingHome}, ${m.id})`
      );
    }

    const existingAway = timeTeamKeyToMatchId.get(awayKey);
    if (existingAway && existingAway !== m.id) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Cannot publish: team conflict at ${new Date(timeMs).toISOString()} (team ${m.awayTeamId
        }) (matches: ${existingAway}, ${m.id})`
      );
    }

    timeTeamKeyToMatchId.set(homeKey, m.id);
    timeTeamKeyToMatchId.set(awayKey, m.id);
  }

  const updated = await prisma.$transaction(async (tx) => {
    // ✅ publish (always)
    const res = await tx.match.updateMany({
      where: { divisionId },
      data: {
        isPublished: true,
        // ⚠️ If MatchStatus enum doesn't include PUBLISHED, remove this line.
        status: "PUBLISHED" as any,
      },
    });

    // ✅ mark division scheduled
    await tx.tournamentDivision.update({
      where: { id: divisionId },
      data: { isScheduled: true },
    });

    return res;
  });

  const adminId = await getAdminId();

  if (adminId) {
    await prisma.activityLog.create({
      data: {
        userId: adminId,
        title: "Division Schedule Published",
        content: `Schedule published for Division ${division.divisionName}`,
      },
    });
  }

  // ✅ notify only opted-in coaches
  const eligibleCoaches = coachIds.length
    ? await prisma.user.findMany({
      where: {
        id: { in: coachIds },
        status: "ACTIVE",
        isDeleted: false,
        isTeamUpdateNotify: true,
      },
      select: { id: true },
    })
    : [];

  const notifyCoachIds = eligibleCoaches.map((u) => u.id);

  if (notifyCoachIds.length) {
    await prisma.notification.createMany({
      data: notifyCoachIds.map((coachId) => ({
        userId: coachId,
        title: "Division Schedule Published",
        body: `Schedule published for Division ${division.divisionName}`,
        data: JSON.stringify({
          type: "DIVISION_SCHEDULE_PUBLISHED",
          divisionId,
        }),
      })),
    });
  }

  return {
    message: "Schedule published successfully",
    meta: { divisionId, publishedMatches: updated.count },
  };
};

// Get Division Standings
type StandingRowWithStatus = {
  rank: number;
  teamId: string;
  teamName: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
};

const getDivisionStandings = async (divisionId: string) => {
  const WIN_POINTS = 3;
  const DRAW_POINTS = 1;

  const division = await prisma.tournamentDivision.findFirst({
    where: { id: divisionId },
    select: { id: true },
  });

  if (!division) {
    throw new ApiError(httpStatus.NOT_FOUND, "Tournament Division not found");
  }

  // ✅ Include all teams (even if 0 games played)
  const teams = await prisma.teamregistration.findMany({
    where: { teamDivisionId: divisionId },
    select: { id: true, teamName: true },
    orderBy: { createdAt: "asc" },
  });

  // ✅ Only matches with scores are counted
  const scoredMatches = await prisma.match.findMany({
    where: {
      divisionId,
      stage: "GROUP",
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { teamName: true } },
      awayTeam: { select: { teamName: true } },
    },
  });

  const map = new Map<string, Omit<StandingRowWithStatus, "rank">>();

  // seed all teams
  for (const t of teams) {
    map.set(t.id, {
      teamId: t.id,
      teamName: t.teamName ?? "",
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    });
  }

  const ensure = (teamId: string, teamName: string) => {
    const existing = map.get(teamId);
    if (existing) return existing;

    const row: Omit<StandingRowWithStatus, "rank"> = {
      teamId,
      teamName: teamName ?? "",
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    };
    map.set(teamId, row);
    return row;
  };

  for (const m of scoredMatches) {
    const hs = m.homeScore as number;
    const as = m.awayScore as number;

    const h = ensure(m.homeTeamId, m.homeTeam?.teamName ?? "");
    const a = ensure(m.awayTeamId, m.awayTeam?.teamName ?? "");

    h.played += 1;
    a.played += 1;

    h.gf += hs;
    h.ga += as;

    a.gf += as;
    a.ga += hs;

    if (hs > as) {
      h.wins += 1;
      h.points += WIN_POINTS;
      a.losses += 1;
    } else if (hs < as) {
      a.wins += 1;
      a.points += WIN_POINTS;
      h.losses += 1;
    } else {
      h.draws += 1;
      a.draws += 1;
      h.points += DRAW_POINTS;
      a.points += DRAW_POINTS;
    }
  }

  // compute gd
  for (const row of map.values()) row.gd = row.gf - row.ga;

  // sort: points -> gd -> gf -> name
  const base = Array.from(map.values()).sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    if (y.gd !== x.gd) return y.gd - x.gd;
    if (y.gf !== x.gf) return y.gf - x.gf;
    return x.teamName.localeCompare(y.teamName);
  });

  const standings: StandingRowWithStatus[] = base.map((r, i) => ({
    rank: i + 1,
    ...r,
  }));

  return { divisionId, standings };
};

// Get Series Leaderboard (based on recent performance in PROVING + CROWN, reset after each ROYAL)
const getSeriesLeaderboard = async (divisionName: Division) => {
  // 1) Reset boundary = last completed ROYAL for this division
  const lastRoyal = await prisma.tournament.findFirst({
    where: {
      tournamentStage: "ROYAL",
      status: "COMPLETED",
      teamRegistrations: { some: { tourDivision: { divisionName } } },
    },
    select: { endDate: true },
    orderBy: { endDate: "desc" },
  });

  const resetAfter = lastRoyal?.endDate ?? new Date(0);

  // 2) Membership: any team that registered in this division (all-time)
  const regs = await prisma.teamregistration.findMany({
    where: { tourDivision: { divisionName } },
    select: { teamId: true },
  });

  const teamIds = [...new Set(regs.map((r) => r.teamId))];

  if (!teamIds.length) {
    return {
      divisionName,
      meta: {
        resetAfter,
        lastRoyalEndedAt: lastRoyal?.endDate ?? null,
        totalTeams: 0,
        qualifiedCount: 0,
        bubbleCount: 0,
        eliminatedCount: 0,
      },
      standings: [],
    };
  }

  // 3) Team names
  const teams = await prisma.teams.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, teamName: true },
  });
  const nameMap = new Map(teams.map((t) => [t.id, t.teamName]));

  // 4) Completed series points from ledger (PROVING + CROWN after reset)
  const ledgers = await prisma.seriesPointsLedger.findMany({
    where: {
      divisionName,
      tournamentStage: { in: ["PROVING", "CROWN"] },
      teamId: { in: teamIds },
      tournament: { startDate: { gt: resetAfter } }, // ✅ reset boundary
    },
    select: { teamId: true, tournamentId: true, totalPoints: true },
  });

  // Aggregate points per team (ledger)
  const agg = new Map<string, { points: number; tournaments: Set<string> }>();
  for (const l of ledgers) {
    const cur = agg.get(l.teamId) ?? { points: 0, tournaments: new Set<string>() };
    cur.points += l.totalPoints ?? 0;
    cur.tournaments.add(l.tournamentId);
    agg.set(l.teamId, cur);
  }

  // 5) LIVE points from running PROVING/CROWN after reset (wins-only)
  //    + tournaments played if any completed scored match exists (wins not required)
  const runningTournaments = await prisma.tournament.findMany({
    where: {
      tournamentStage: { in: ["PROVING", "CROWN"] },
      status: { in: ["OPEN", "LIVE"] }, // ✅ only running
      startDate: { gt: resetAfter }, // ✅ after reset
      teamRegistrations: { some: { tourDivision: { divisionName } } },
    },
    select: { id: true, tournamentStage: true },
  });

  if (runningTournaments.length) {
    const runningTournamentIds = runningTournaments.map((t) => t.id);
    const stageByTournamentId = new Map(runningTournaments.map((t) => [t.id, t.tournamentStage]));

    // Regs for running tournaments + this division (registrationId -> teamId)
    const runningRegRows = await prisma.teamregistration.findMany({
      where: {
        tournamentId: { in: runningTournamentIds },
        tourDivision: { divisionName },
        teamId: { in: teamIds },
      },
      select: { id: true, teamId: true, tournamentId: true },
    });

    const regIdToTeamId = new Map(runningRegRows.map((r) => [r.id, r.teamId]));
    const regIds = runningRegRows.map((r) => r.id);

    if (regIds.length) {
      // Completed scored matches in those running tournaments for those regs
      const runningMatches = await prisma.match.findMany({
        where: {
          tournamentId: { in: runningTournamentIds },
          status: "COMPLETED",
          homeScore: { not: null },
          awayScore: { not: null },
          OR: [{ homeTeamId: { in: regIds } }, { awayTeamId: { in: regIds } }],
        },
        select: {
          tournamentId: true,
          homeTeamId: true,
          awayTeamId: true,
          homeScore: true,
          awayScore: true,
        },
      });

      // ✅ track which registrations actually played (had a completed scored match)
      const playedRegIds = new Set<string>();
      for (const m of runningMatches) {
        playedRegIds.add(m.homeTeamId);
        playedRegIds.add(m.awayTeamId);
      }

      // wins so far per (teamId, tournamentId)
      const winsByTeamTournament = new Map<string, number>();
      const k = (teamId: string, tournamentId: string) => `${teamId}:${tournamentId}`;

      for (const m of runningMatches) {
        const hs = m.homeScore as number;
        const as = m.awayScore as number;
        if (hs === as) continue;

        const winnerRegId = hs > as ? m.homeTeamId : m.awayTeamId;
        const teamId = regIdToTeamId.get(winnerRegId);
        if (!teamId) continue;

        const key = k(teamId, m.tournamentId);
        winsByTeamTournament.set(key, (winsByTeamTournament.get(key) ?? 0) + 1);
      }

      // ✅ merge: tournaments count from "played", points from wins
      for (const rr of runningRegRows) {
        const stage = stageByTournamentId.get(rr.tournamentId);
        if (!stage) continue;

        const cur = agg.get(rr.teamId) ?? { points: 0, tournaments: new Set<string>() };

        // tournaments played: any completed scored match (wins not required)
        if (playedRegIds.has(rr.id)) {
          cur.tournaments.add(rr.tournamentId);
        }

        // live points: wins-only
        const wins = winsByTeamTournament.get(k(rr.teamId, rr.tournamentId)) ?? 0;
        const livePoints = wins * winBonusByStage(stage);
        cur.points += livePoints;

        agg.set(rr.teamId, cur);
      }
    }
  }

  // 6) Build rows (always include all teams; default points=0)
  const rows = teamIds
    .map((teamId) => ({
      teamId,
      teamName: nameMap.get(teamId) ?? "Unknown",
      tournaments: agg.get(teamId)?.tournaments.size ?? 0,
      points: agg.get(teamId)?.points ?? 0,
    }))
    .sort((a, b) => b.points - a.points || a.teamName.localeCompare(b.teamName));

  const totalTeams = rows.length;

  // 7) Qualification rules (your existing logic)
  const qualifiedCount = Math.min(
    totalTeams,
    Math.max(1, Math.floor(highestPowerOfTwoLE(totalTeams) / 2))
  );
  const bubbleCount = Math.min(totalTeams - qualifiedCount, qualifiedCount);

  // 8) Discount overrides (unique by teamId)
  const discountRows = await prisma.seriesTeamDiscount.findMany({
    where: { teamId: { in: teamIds } },
    select: { teamId: true, discountPercent: true },
  });
  const discountMap = new Map(discountRows.map((d) => [d.teamId, d.discountPercent]));

  const standings = rows.map((r, idx) => {
    const rank = idx + 1;

    let statusBadge: StandingStatusBadge = "ELIMINATED";
    if (rank <= qualifiedCount) statusBadge = "QUALIFIED";
    else if (rank <= qualifiedCount + bubbleCount) statusBadge = "ON_THE_BUBBLE";

    const defaultDiscount = getDefaultDiscount(rank);
    const override = discountMap.get(r.teamId);
    const discountPercent = clampDiscount(override ?? defaultDiscount);

    return {
      rank,
      ...r,
      statusBadge,
      inviteEnabled: statusBadge === "QUALIFIED",
      discountPercent,
      discountSource: override !== undefined ? "OVERRIDE" : "DEFAULT",
    };
  });

  return {
    divisionName,
    meta: {
      resetAfter,
      lastRoyalEndedAt: lastRoyal?.endDate ?? null,
      totalTeams,
      qualifiedCount,
      bubbleCount,
      eliminatedCount: Math.max(0, totalTeams - qualifiedCount - bubbleCount),
    },
    standings,
  };
};

// Set Series Leaderboard Discount Override (editable by coach, independent of schedule)
const setTeamDiscountOverride = async (teamId: string, updatedByUserId: string, data: any) => {

  return prisma.$transaction(async (tx) => {
    const existing = await tx.seriesTeamDiscount.findFirst({
      where: { teamId: teamId },
      select: { id: true },
    });

    if (existing) {
      return tx.seriesTeamDiscount.update({
        where: { id: existing.id },
        data: {
          discountPercent: clampDiscount(data.discountPercent),
          updatedByUserId: updatedByUserId,
        },
      });
    }

    return tx.seriesTeamDiscount.create({
      data: {
        teamId: teamId,
        discountPercent: clampDiscount(data.discountPercent),
        updatedByUserId: updatedByUserId,
      },
    });
  });
};

export const tournamentService = {
  createTournament,
  getTournamentList,
  getTournamentByIdByAdmin,
  updateTournament,
  deleteTournament,
  deleteTournamentDivision,
  getTeamsUnderDivision,
  generateDivisionSchedule,
  getDivisionScheduleData,
  editMatchSchedule,
  publishDivisionSchedule,
  getDivisionStandings,
  getSeriesLeaderboard,
  setTeamDiscountOverride,
};