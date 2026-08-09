import { Prisma, ScheduleWeekStatus, Season } from "@prisma/client";
import httpStatus from "http-status";
import ApiError from "../../../errors/ApiErrors";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import prisma from "../../../shared/prisma";

// Create schedule period with weeks and sessions
const createSchedule = async (data: any, createdById: string) => {
    const { scheduleName, season, numberOfWeek, weeks } = data;

    if (weeks.length !== numberOfWeek) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            "Number of weeks must match the weeks array length"
        );
    }

    // Derive startDate / endDate from first and last week by weekNumber
    const sortedWeeks = [...weeks].sort((a: any, b: any) => a.weekNumber - b.weekNumber);
    const startDate = new Date(sortedWeeks[0].startDate);
    const endDate = new Date(sortedWeeks[sortedWeeks.length - 1].endDate);

    const result = await prisma.schedulePeriod.create({
        data: {
            createdById,
            scheduleName,
            season: season as Season,
            numberOfWeek,
            startDate,
            endDate,
            weeks: {
                create: weeks.map((w: any) => ({
                    weekNumber: w.weekNumber,
                    startDate: new Date(w.startDate),
                    endDate: new Date(w.endDate),
                    sessions: {
                        create: [
                            {
                                sessionType: "AM",
                                title: "Proving Camp Session",
                                dropOffTime: "8:45 AM",
                                startTime: "9:00 AM",
                                endTime: "12:00 PM",
                                capacity: 90,
                                goalieSlots: 20,
                            },
                        ],
                    },
                })),
            },
        },
        include: {
            weeks: {
                include: { sessions: true },
                orderBy: { weekNumber: "asc" },
            },
        },
    });

    await prisma.notification.create({
        data: {
            userId: createdById,
            title: "New Schedule Period Created",
            body: `A new schedule period has been created: ${result.scheduleName}.`,
        },
    });

    return result;
};

type IScheduleFilterRequest = {
    searchTerm?: string;
    season?: string;
    status?: string;
};

const scheduleSearchAbleFields = ["scheduleName"];

// List schedule periods with computed stats
const getScheduleList = async (
    options: IPaginationOptions,
    filters: IScheduleFilterRequest,
) => {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = filters;
    const andConditions: Prisma.SchedulePeriodWhereInput[] = [];

    andConditions.push({ isDeleted: false });

    if (searchTerm) {
        andConditions.push({
            OR: scheduleSearchAbleFields.map((field) => ({
                [field]: { contains: searchTerm, mode: "insensitive" },
            })),
        });
    }

    if (filterData.season) {
        andConditions.push({ season: filterData.season as Season });
    }

    if (filterData.status) {
        andConditions.push({ status: filterData.status as ScheduleWeekStatus });
    }

    const whereConditions: Prisma.SchedulePeriodWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

    const [data, total] = await Promise.all([
        prisma.schedulePeriod.findMany({
            skip,
            take: limit,
            where: whereConditions,
            include: {
                weeks: {
                    include: {
                        sessions: true,
                    },
                    orderBy: { weekNumber: "asc" },
                },
            },
            orderBy: { createdAt: "desc" },
        }),
        prisma.schedulePeriod.count({ where: whereConditions }),
    ]);

    // Compute stats for each schedule
    const enrichedData = data.map((schedule) => {
        let totalCapacity = 0;
        let totalEnrollment = 0;

        schedule.weeks.forEach((week) => {
            week.sessions.forEach((session: any) => {
                totalCapacity += session.capacity;
                totalEnrollment += session._count?.registrations || 0;
            });
        });

        const fillRate =
            totalCapacity > 0
                ? Math.round((totalEnrollment / totalCapacity) * 100)
                : 0;

        return {
            totalWeeks: schedule.numberOfWeek,
            totalEnrollment,
            totalCapacity,
            fillRate,
            ...schedule,
        };
    });

    return {
        meta: { total, page, limit },
        data: enrichedData,
    };
};

// Get single schedule by id with full week/session details
const getScheduleById = async (id: string) => {
    const result = await prisma.schedulePeriod.findUnique({
        where: { id },
        include: {
            weeks: {
                include: {
                    sessions: true,
                },
                orderBy: { weekNumber: "asc" },
            },
        },
    });

    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, "Schedule not found");
    }

    // Enrich weeks with enrollment counts
    const enrichedWeeks = result.weeks.map((week) => {
        const enrichedSessions = week.sessions.map((session) => ({
            ...session,
            currentEnrollment: session.totalRegistered,
            spotsAvailable: session.capacity - session.totalRegistered,
        }));

        return {
            ...week,
            sessions: enrichedSessions,
        };
    });

    return { ...result, weeks: enrichedWeeks };
};

// Update schedule period and weeks
const updateSchedule = async (id: string, data: any) => {
    const existing = await prisma.schedulePeriod.findUnique({
        where: { id },
        include: { weeks: true },
    });

    if (!existing) {
        throw new ApiError(httpStatus.NOT_FOUND, "Schedule not found");
    }

    const { weeks, ...scheduleData } = data;

    // Update schedule period fields
    const updateData: any = {};
    if (scheduleData.scheduleName)
        updateData.scheduleName = scheduleData.scheduleName;
    if (scheduleData.season) updateData.season = scheduleData.season as Season;
    if (scheduleData.numberOfWeek)
        updateData.numberOfWeek = scheduleData.numberOfWeek;

    // If weeks provided, delete old weeks and recreate
    if (weeks && weeks.length > 0) {
        await prisma.scheduleWeek.deleteMany({
            where: { schedulePeriodId: id },
        });

        // Recompute startDate / endDate from the new weeks
        const sortedNewWeeks = [...weeks].sort((a: any, b: any) => a.weekNumber - b.weekNumber);
        updateData.startDate = new Date(sortedNewWeeks[0].startDate);
        updateData.endDate = new Date(sortedNewWeeks[sortedNewWeeks.length - 1].endDate);

        const result = await prisma.schedulePeriod.update({
            where: { id },
            data: {
                ...updateData,
                weeks: {
                    create: weeks.map((w: any) => ({
                        weekNumber: w.weekNumber,
                        startDate: new Date(w.startDate),
                        endDate: new Date(w.endDate),
                        sessions: {
                            create: [
                                {
                                    sessionType: "AM",
                                    title: "Proving Camp Session",
                                    dropOffTime: "8:45 AM",
                                    startTime: "9:00 AM",
                                    endTime: "12:00 PM",
                                    capacity: 90,
                                    goalieSlots: 20,
                                },
                            ],
                        },
                    })),
                },
            },
            include: {
                weeks: {
                    include: { sessions: true },
                    orderBy: { weekNumber: "asc" },
                },
            },
        });

        return result;
    }

    const result = await prisma.schedulePeriod.update({
        where: { id },
        data: updateData,
        include: {
            weeks: {
                include: { sessions: true },
                orderBy: { weekNumber: "asc" },
            },
        },
    });

    return result;
};

// Update capacity for a specific week
const updateWeekCapacity = async (
    weekId: string,
    capacity: number
) => {
    const week = await prisma.scheduleWeek.findUnique({
        where: { id: weekId },
        include: { sessions: true },
    });

    if (!week) {
        throw new ApiError(httpStatus.NOT_FOUND, "Week not found");
    }

    const session = week.sessions.find((s) => s.sessionType === "AM");

    if (!session) {
        throw new ApiError(httpStatus.NOT_FOUND, "Session not found for this week");
    }

    const currentCount = await prisma.campRegistration.count({
        where: { scheduleSessionIds: { has: session.id }, status: "CONFIRMED" },
    });

    if (capacity < currentCount) {
        throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Capacity cannot be less than current enrollment (${currentCount})`
        );
    }

    await prisma.scheduleSession.update({
        where: { id: session.id },
        data: { capacity },
    });

    return prisma.scheduleWeek.findUnique({
        where: { id: weekId },
        include: { sessions: true },
    });
};

// Soft delete schedule period
const deleteSchedule = async (id: string) => {
    const existing = await prisma.schedulePeriod.findUnique({ where: { id } });
    if (!existing) {
        throw new ApiError(httpStatus.NOT_FOUND, "Schedule not found");
    }

    return prisma.schedulePeriod.update({
        where: { id },
        data: { isDeleted: true },
    });
};

export const scheduleService = {
    createSchedule,
    getScheduleList,
    getScheduleById,
    updateSchedule,
    updateWeekCapacity,
    deleteSchedule,
};
