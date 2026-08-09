// Notification.controller: Module file for the Notification.controller functionality.
import { notificationService } from './notification.service';
import httpStatus from 'http-status';
import { Request, Response } from 'express';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import pick from '../../../shared/pick';

const sendNotificationToUser = catchAsync(async (req: Request, res: Response) => {
  const { title, body, userId, deviceToken } = req.body;
  if (!title || !body || !userId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'Device token, title, and body are required',
    });
  }
  await notificationService.sendNotification(title, body, userId, deviceToken);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification sent successfully',
    data: null,
  });
});

const getAllNotificationsController = catchAsync(async (req: Request, res: Response) => {
  const notifications = await notificationService.getAllNotifications();
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'All notifications fetched successfully',
    data: notifications,
  });
});

const getNotificationByUserIdController = catchAsync(async (req: Request, res: Response) => {
  const user = req.user.id;
  const options = pick(req.query, ['limit', 'page', 'sortBy', 'sortOrder']);
  const notifications = await notificationService.getNotificationByUserId(user, options);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notifications fetched successfully',
    data: notifications,
  });
});

const getAllUnreadNotificationsByUser = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user.id;
  const notifications = await notificationService.getAllUnreadNotificationsByUser(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Unread notifications fetched successfully',
    data: notifications,
  });
});

const readNotificationByUserIdController = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const notifications = await notificationService.readNotificationByUserId(userId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notifications marked as read successfully',
    data: notifications,
  });
});

const sendNotificationToGroup = catchAsync(async (req, res) => {
  const user = req.user as any;
  const result = await notificationService.sendNotificationToGroup(req.body);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification sent successfully',
    data: result,
  });
});

const deleteNotification = catchAsync(async (req, res) => {
  const { notificationId } = req.params;
  const result = await notificationService.deleteNotification(notificationId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Notification deleted successfully',
    data: result,
  });
});

export const NotificationController = {
  sendNotificationToUser,
  getAllNotificationsController,
  getNotificationByUserIdController,
  getAllUnreadNotificationsByUser,
  readNotificationByUserIdController,
  sendNotificationToGroup,
  deleteNotification
};
