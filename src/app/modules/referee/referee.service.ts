import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { Prisma } from "@prisma/client";

// create Referee
const createReferee = async (data: any) => {
  const result = await prisma.referee.create({
    data,
  });
  return result;
};

// get all Referee
type IRefereeFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
};
const refereeSearchAbleFields = ["name", "email"];

const getRefereeList = async (
  options: IPaginationOptions,
  filters: IRefereeFilterRequest,
) => {
  // const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.RefereeWhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...refereeSearchAbleFields.map((field) => ({
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
      // if (key === "status") {
      //   const statuses = Array.isArray(value) ? value : [value];
      //   andConditions.push({
      //     status: { in: statuses },
      //   });
      //   return;
      // }
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions: Prisma.RefereeWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.referee.findMany({
    // skip,
    // take: limit,
    where: whereConditions,
    orderBy: { createdAt: "desc" },
  });

  // const total = await prisma.referee.count({ where: whereConditions });

  return {
    // meta: { total, page, limit },
    data: result,
  };
};

// get Referee by user id
const getRefereeByUserId = async (id: string) => {
  const result = await prisma.referee.findMany({ where: { id } });

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Referee not found");
  }

  return result;
};

// update Referee
const updateReferee = async (id: string, data: any) => {
  const existingReferee = await prisma.referee.findUnique({ where: { id } });

  if (!existingReferee) {
    throw new ApiError(httpStatus.NOT_FOUND, "Referee not found");
  }

  const result = await prisma.referee.update({
    where: { id },
    data,
  });

  return result;
};

// delete Referee
const deleteReferee = async (id: string) => {
  const result = await prisma.referee.delete({ where: { id } });
  return result;
};

export const refereeService = {
  createReferee,
  getRefereeList,
  getRefereeByUserId,
  updateReferee,
  deleteReferee,
};
