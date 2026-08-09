// Notification.routes: Module file for the Notification.routes functionality.
import express from 'express';
import { NotificationController } from './notification.controller';
import auth from '../../middlewares/auth';
import { UserRole } from '@prisma/client';
import validateRequest from "../../middlewares/validateRequest";
import { notificationValidation } from "./notification.validation";

const router = express.Router();

//Send Notification
router.post('/send-noti', validateRequest(notificationValidation.createSchema), NotificationController.sendNotificationToUser);

// Get all notifications
router.get('/all-noti', auth(), NotificationController.getAllNotificationsController);

// Get notifications by user ID
router.get('/get-noti', auth(), NotificationController.getNotificationByUserIdController);

// Get unread notifications by user ID
router.get('/unread-noti', auth(), NotificationController.getAllUnreadNotificationsByUser);

// Mark notifications as read by user ID
router.patch('/read-noti', auth(), NotificationController.readNotificationByUserIdController);

//Send Group Notification
router.post('/send-group-noti', auth(UserRole.ADMIN), NotificationController.sendNotificationToGroup);

//Delete Notification
router.delete('/delete-noti/:notificationId', auth(), NotificationController.deleteNotification);

export const NotificationRoutes = router;