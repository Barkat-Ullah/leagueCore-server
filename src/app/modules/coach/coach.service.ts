import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiErrors';
import { IPaginationOptions } from '../../../interfaces/paginations';
import { paginationHelper } from '../../../helpars/paginationHelper';
import prisma from '../../../shared/prisma';
import { fileUploader } from '../../../helpars/fileUploader';
import { Prisma } from '@prisma/client';

// Create coach
const createCoach = async (req: any, createdById: string) => {
    const file = req.file;
    const data = req.body;
    let image;

    const user = await prisma.user.findUnique({ where: { id: createdById } });
    if (!user) {
        throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    if (file) {
        image = (await fileUploader.uploadToCloudinary(file)).Location;
    }

    const result = await prisma.coach.create({
        data: {
            createdById,
            name: data.name,
            badge: data.badge,
            coachBio: data.coachBio,
            role: data.role,
            image: image || null,
        },
    });

    if (!result) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Failed to create coach');
    }

    return result;
};

type ICoachFilterRequest = {
    searchTerm?: string;
    id?: string;
    createdAt?: string;
};

const coachSearchAbleFields = ['name', 'coachBio'];

// List coaches
const getCoachList = async (
    options: IPaginationOptions,
    filters: ICoachFilterRequest,
    // authUserId?: string
) => {

    const { page, limit, skip } = paginationHelper.calculatePagination(options);
    const { searchTerm, ...filterData } = filters;
    const andConditions: Prisma.CoachWhereInput[] = [];

    // if (authUserId) {
    //     andConditions.push({ createdById: authUserId, isDeleted: false });
    // } else {
    //     andConditions.push({ isDeleted: false });
    // }

    if (searchTerm) {
        andConditions.push({
            OR: coachSearchAbleFields.map((field) => ({
                [field]: {
                    contains: searchTerm,
                    mode: 'insensitive',
                },
            })),
        });
    }

    if (Object.keys(filterData).length) {
        Object.keys(filterData).forEach((key) => {
            const value = (filterData as any)[key];
            if (value === '' || value == null) return;
            if (key === 'createdAt' && value) {
                const start = new Date(value);
                start.setHours(0, 0, 0, 0);
                const end = new Date(value);
                end.setHours(23, 59, 59, 999);
                andConditions.push({
                    createdAt: {
                        gte: start,
                        lte: end,
                    },
                });
                return;
            }
            andConditions.push({ [key]: value });
        });
    }

    const whereConditions: Prisma.CoachWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const [data, total] = await Promise.all([
        prisma.coach.findMany({
            skip,
            take: limit,
            where: whereConditions,
            orderBy: { createdAt: 'desc' },
        }),
        prisma.coach.count({ where: whereConditions }),
    ]);

    return {
        meta: { total, page, limit },
        data,
    };
};

// Get coach by user
const getCoachByUserId = async (userId: string) => {
    const result = await prisma.coach.findFirst({ where: { createdById: userId } });
    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Coach not found');
    }
    return result;
};

// Get coach by id
const getCoachById = async (id: string) => {
    const result = await prisma.coach.findUnique({ where: { id } });
    if (!result) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Coach not found');
    }
    return result;
};

// Update coach
const updateCoach = async (id: string, req: any) => {
    const file = req.file;
    const data = req.body;
    let image;

    const existingCoach = await prisma.coach.findUnique({ where: { id } });
    if (!existingCoach) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Coach not found');
    }

    if (file) {
        image = (await fileUploader.uploadToCloudinary(file)).Location;
    }

    const result = await prisma.coach.update({
        where: { id },
        data: {
            name: data.name ?? existingCoach.name,
            badge: data.badge ?? existingCoach.badge,
            coachBio: data.coachBio ?? existingCoach.coachBio,
            role: data.role ?? existingCoach.role,
            image: image ?? existingCoach.image,
        },
    });

    return result;
};

// Delete coach
const deleteCoach = async (id: string) => {
    const existingCoach = await prisma.coach.findUnique({ where: { id } });
    if (!existingCoach) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Coach not found');
    }
    return prisma.coach.delete({ where: { id } });
};

export const coachService = {
    createCoach,
    getCoachList,
    getCoachByUserId,
    getCoachById,
    updateCoach,
    deleteCoach,
};
