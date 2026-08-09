// Notification.service: Module file for the Notification.service functionality.
import { paginationHelper } from "../../../helpars/paginationHelper";
import { IPaginationOptions } from "../../../interfaces/paginations";
import admin from "../../../shared/firebase";
import prisma from "../../../shared/prisma";

//Send Notification
const sendNotification = async (
  title: string,
  body: string,
  userId: string,
  deviceToken?: string,
) => {
  let message;
  if (deviceToken) {
    message = {
      notification: { title, body },
      token: deviceToken,
    };
    console.log(message);
  }

  try {
    if (message) {
      const test = await admin.messaging().send(message);
      console.log(test);
    }

    await prisma.notification.create({
      data: {
        title,
        body,
        userId,
      },
    });
    console.log('Notification sent successfully');
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

//Get All Notifications
const getAllNotifications = async (options: IPaginationOptions) => {
  try {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count(),
    ]);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: notifications,
    };
  } catch (error) {
    console.error('Error fetching notifications:', error);
    throw error;
  }
};

//Get Notification By UserId
const getNotificationByUserId = async (userId: string, options: IPaginationOptions) => {
  const { page, skip, limit } = paginationHelper.calculatePagination(options);
  const notifications = await prisma.notification.findMany({
    skip,
    take: limit,
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  const total = await prisma.notification.count({ where: { userId } });
  
  return {
    total,
    page,
    limit,
    data: notifications,
  };
};

//Get all Unread Notifications
const getAllUnreadNotificationsByUser = async (userId: string, options: IPaginationOptions) => {
  try {
    const { page, limit, skip } = paginationHelper.calculatePagination(options);

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        skip,
        take: limit,
        where: { userId: userId, read: false },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: userId, read: false } }),
    ]);

    return {
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
      data: notifications,
    };
  } catch (error) {
    console.error('Error fetching unread notifications:', error);
    throw error;
  }
};

//Read Notification By UserId
const readNotificationByUserId = async (userId: string) => {
  try {
    const notifications = await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return notifications;
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    throw error;
  }
};

//Send Notification To Group
const sendNotificationToGroup = async (notificationData: {
  title: string,
  body: string,
  users: string[]
}) => {
  const { title, body, users } = notificationData;

  const notifications = users.map(async (userId) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { fcmToken: true },
    });

    if (user?.fcmToken) {
      const message = {
        notification: { title, body },
        token: user.fcmToken,
      };

      await admin.messaging().send(message);
    }

    return prisma.notification.create({
      data: {
        title,
        body,
        userId,
      },
    });
  });

  await Promise.all(notifications);
  return { message: "Notifications sent successfully" };
};

//Delete Notification
const deleteNotification = async (notificationId: string) => {
  try {
    const notification = await prisma.notification.delete({
      where: { id: notificationId },
    });
    return notification;
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};


export const notificationService = {
  sendNotification,
  getAllNotifications,
  getNotificationByUserId,
  getAllUnreadNotificationsByUser,
  readNotificationByUserId,
  sendNotificationToGroup,
  deleteNotification
};
