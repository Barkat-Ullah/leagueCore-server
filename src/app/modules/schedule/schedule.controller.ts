import httpStatus from "http-status";
import { Request, Response } from "express";
import catchAsync from "../../../shared/catchAsync";
import pick from "../../../shared/pick";
import sendResponse from "../../../shared/sendResponse";
import { scheduleService } from "./schedule.service";

// Create schedule
const createSchedule = catchAsync(async (req: Request, res: Response) => {
    const result = await scheduleService.createSchedule(req.body, req.user.id);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Schedule created successfully",
        data: result,
    });
});

// List schedules
const scheduleFilterableFields = ["searchTerm", "season"];
const getScheduleList = catchAsync(async (req: Request, res: Response) => {
    const options = pick(req.query, ["limit", "page", "sortBy", "sortOrder"]);
    const filters = pick(req.query, scheduleFilterableFields);
    const result = await scheduleService.getScheduleList(
        options,
        filters,
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Schedule list retrieved successfully",
        meta: result.meta,
        data: result.data,
    });
});

// Get schedule by id
const getScheduleById = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await scheduleService.getScheduleById(id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Schedule retrieved successfully",
        data: result,
    });
});

// Update schedule
const updateSchedule = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await scheduleService.updateSchedule(id, req.body);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Schedule updated successfully",
        data: result,
    });
});

// Update week capacity
const updateWeekCapacity = catchAsync(async (req: Request, res: Response) => {
    const { weekId } = req.params;
    const { capacity } = req.body;
    const result = await scheduleService.updateWeekCapacity(
        weekId,
        capacity
    );
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Week capacity updated successfully",
        data: result,
    });
});

// Delete schedule
const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
    const { id } = req.params;
    const result = await scheduleService.deleteSchedule(id);
    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: "Schedule deleted successfully",
        data: result,
    });
});

export const scheduleController = {
    createSchedule,
    getScheduleList,
    getScheduleById,
    updateSchedule,
    updateWeekCapacity,
    deleteSchedule,
};
