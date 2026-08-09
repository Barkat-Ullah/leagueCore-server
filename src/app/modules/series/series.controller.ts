import httpStatus from "http-status";
import catchAsync from "../../../shared/catchAsync";
import sendResponse from "../../../shared/sendResponse";
import { seriesService } from "./series.service";
import { Request, Response } from "express";
import pick from "../../../shared/pick";

// create Series
const createSeries = catchAsync(async (req: Request, res: Response) => {
  const data = req.body;
  const result = await seriesService.createSeries(data);
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Series created successfully",
    data: result,
  });
});

// get all Series
const seriesFilterableFields = ["searchTerm", "id", "createdAt", "type"];
const getSeriesList = catchAsync(async (req: Request, res: Response) => {
  const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
  const filters = pick(req.query, seriesFilterableFields);
  const result = await seriesService.getSeriesList(options, filters);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Series list retrieved successfully",
    meta: result.meta,
    data: result.data,
  });
});

// get Series by userId
const getSeriesByUserId = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const result = await seriesService.getSeriesByUserId(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Series details retrieved successfully",
    data: result,
  });
});

// update Series
const updateSeries = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const data = req.body;
  const result = await seriesService.updateSeries(id, data);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Series updated successfully",
    data: result,
  });
});

// delete Series
const deleteSeries = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const result = await seriesService.deleteSeries(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Series deleted successfully",
    data: result,
  });
});

export const seriesController = {
  createSeries,
  getSeriesList,
  getSeriesByUserId,
  updateSeries,
  deleteSeries,
};
