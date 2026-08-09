import prisma from "../../../shared/prisma";
import ApiError from "../../../errors/ApiErrors";
import httpStatus from "http-status";
import { IPaginationOptions } from "../../../interfaces/paginations";
import { paginationHelper } from "../../../helpars/paginationHelper";
import { Prisma } from "@prisma/client";

// create Series
const createSeries = async (data: any) => {
  const result = await prisma.series.create({
    data,
  });
  return result;
};

// get all Series
type ISeriesFilterRequest = {
  searchTerm?: string;
  id?: string;
  createdAt?: string;
  type?: string;
};
const seriesSearchAbleFields = ["fullName", "email", "userName"];

const getSeriesList = async (
  options: IPaginationOptions,
  filters: ISeriesFilterRequest,
) => {
  const { page, limit, skip } = paginationHelper.calculatePagination(options);
  const { searchTerm, ...filterData } = filters;

  const andConditions: Prisma.SeriesWhereInput[] = [];

  if (searchTerm) {
    andConditions.push({
      OR: [
        ...seriesSearchAbleFields.map((field) => ({
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
      if (key === "type") {
        const types = Array.isArray(value) ? value : [value];
        andConditions.push({
          type: { in: types },
        });
        return;
      }
      andConditions.push({ [key]: value });
    });
  }

  const whereConditions: Prisma.SeriesWhereInput =
    andConditions.length > 0 ? { AND: andConditions } : {};

  const result = await prisma.series.findMany({
    skip,
    take: limit,
    where: whereConditions,
    select: {
      id: true,
      type: true,
      youthFee: true,
      adultFee: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log("Checking result length:", result.length);

  if (result && result.length > 0) {
    console.table(result);
  } else {
    console.log("No series data found in database.");
  }
  const total = await prisma.series.count({ where: whereConditions });

  return {
    meta: { total, page, limit },
    data: result,
  };
};

// get Series by user id
const getSeriesByUserId = async (userId: string) => {
  // const result = await prisma.series.findMany({ where: { userId } });
  const result = await prisma.series.findMany();

  if (!result) {
    throw new ApiError(httpStatus.NOT_FOUND, "Series not found");
  }

  return result;
};

// update Series
const updateSeries = async (
  id: string,
  data: { youthFee: number; adultFee: number },
) => {
  const existingSeries = await prisma.series.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      youthFee: true,
      adultFee: true,
    },
  });

  if (!existingSeries) {
    throw new ApiError(httpStatus.NOT_FOUND, "Series not found");
  }

  const result = await prisma.series.update({
    where: { id },
    data,
  });

  if (existingSeries.type) {
    await prisma.tournament.updateMany({
      where: {
        tournamentStage: existingSeries.type,
      },
      data: {
        youthFee: data.youthFee,
        adultFee: data.adultFee,
      },
    });
  }

  return result;
};
// delete Series
const deleteSeries = async (id: string) => {
  const result = await prisma.series.delete({ where: { id } });
  return result;
};

export const seriesService = {
  createSeries,
  getSeriesList,
  getSeriesByUserId,
  updateSeries,
  deleteSeries,
};
