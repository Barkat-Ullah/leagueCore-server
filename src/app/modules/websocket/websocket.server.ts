import { Server } from "http";
import { WebSocket, WebSocketServer } from "ws";

import { jwtHelpers } from "../../../helpars/jwtHelpers";
import config from "../../../config";
import prisma from "../../../shared/prisma";

interface ExtendedWebSocket extends WebSocket {
    userId?: string;
    role?: "USER" | "ADMIN";
}

function broadcastToAll(wss: WebSocketServer, message: object) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

export const onlineUsers = new Set<string>();
const userSockets = new Map<string, ExtendedWebSocket>();
const clients = new Map<string, { ws: ExtendedWebSocket, userId: string, role: "USER" | "ADMIN"; }>();

export async function setupWebSocket(server: Server) {
    const wss = new WebSocketServer({ server });
    console.log("WebSocket server is running");

    wss.on("connection", (ws: ExtendedWebSocket) => {
        console.log("New user connected");

        ws.on("message", async (data: string) => {
            try {
                const parsedData = JSON.parse(data);
                switch (parsedData.event) {
                    case "authenticate": {
                        const token = parsedData.token;

                        if (!token) {
                            console.log("No token provided");
                            ws.close();
                            return;
                        }

                        const user = jwtHelpers.verifyToken(
                            token,
                            config.jwt.jwt_secret as string
                        );

                        if (!user) {
                            console.log("Invalid token");
                            ws.close();
                            return;
                        }

                        const { id } = user;

                        ws.userId = id;
                        ws.role = user.role as "ADMIN" | "USER";
                        onlineUsers.add(id);

                        userSockets.set(id, ws);

                        broadcastToAll(wss, {
                            event: "userStatus",
                            data: { userId: id, isOnline: true },
                        });
                        break;
                    }
                    //Send Message
                    case "message": {
                        const { receiverId, message, imageUrl } = parsedData;

                        if (!ws.userId || !receiverId) {
                            console.log("Invalid message payload");
                            return;
                        }

                        console.log("📩 Incoming message:", { receiverId, message, imageUrl });

                        let room = await prisma.room.findFirst({
                            where: {
                                OR: [
                                    { senderId: ws.userId, receiverId },
                                    { senderId: receiverId, receiverId: ws.userId },
                                ],
                            },
                        });

                        if (!room) {
                            room = await prisma.room.create({
                                data: { senderId: ws.userId, receiverId },
                            });
                        }

                        const chat = await prisma.chat.create({
                            data: {
                                senderId: ws.userId,
                                receiverId,
                                roomId: room.id,
                                message,
                                imageUrl,
                            },
                        });

                        console.log("💾 Saved chat:", chat);

                        const receiverSocket = userSockets.get(receiverId);
                        if (receiverSocket) {
                            receiverSocket.send(JSON.stringify({ event: "message", data: { chat } }));
                        }
                        ws.send(JSON.stringify({ event: "message", data: { chat } }));
                        break;
                    }
                    //Get All Message
                    case "fetchChats": {
                        const { receiverId } = parsedData;
                        if (!ws.userId) {
                            console.log("User not authenticated");
                            return;
                        }

                        const room = await prisma.room.findFirst({
                            where: {
                                OR: [
                                    { senderId: ws.userId, receiverId },
                                    { senderId: receiverId, receiverId: ws.userId },
                                ],
                            },
                        });

                        if (!room) {
                            ws.send(JSON.stringify({ event: "fetchChats", data: [] }));
                            return;
                        }

                        const chats = await prisma.chat.findMany({
                            where: { roomId: room.id },
                            select: {
                                id: true,
                                senderId: true,
                                receiverId: true,
                                message: true,
                                imageUrl: true,
                                createdAt: true,
                            },
                            orderBy: { createdAt: "asc" },
                        });

                        await prisma.chat.updateMany({
                            where: { roomId: room.id, receiverId: ws.userId },
                            data: { isRead: true },
                        });

                        ws.send(
                            JSON.stringify({
                                event: "fetchChats",
                                data: chats,
                            })
                        );
                        break;
                    }
                    //See online
                    case "onlineUsers": {
                        const onlineUserList = Array.from(onlineUsers);
                        const user = await prisma.user.findMany({
                            where: { id: { in: onlineUserList } },
                            select: {
                                id: true,
                                email: true,
                                role: true,
                            },
                        });
                        ws.send(
                            JSON.stringify({
                                event: "onlineUsers",
                                data: user,
                            })
                        );
                        break;
                    }
                    //UnRead Messages
                    case "unReadMessages": {
                        const { receiverId } = parsedData;
                        if (!ws.userId || !receiverId) {
                            console.log("Invalid unread messages payload");
                            return;
                        }

                        const room = await prisma.room.findFirst({
                            where: {
                                OR: [
                                    { senderId: ws.userId, receiverId },
                                    { senderId: receiverId, receiverId: ws.userId },
                                ],
                            },
                        });

                        if (!room) {
                            ws.send(JSON.stringify({ event: "noUnreadMessages", data: [] }));
                            return;
                        }

                        const unReadMessages = await prisma.chat.findMany({
                            where: { roomId: room.id, isRead: false, receiverId: ws.userId },
                        });

                        const unReadCount = unReadMessages.length;

                        ws.send(
                            JSON.stringify({
                                event: "unReadMessages",
                                data: { messages: unReadMessages, count: unReadCount },
                            })
                        );
                        break;
                    }
                    //See messageList
                    case "messageList": {
                        try {
                            // 1️⃣ Fetch all rooms where the user is involved
                            const rooms = await prisma.room.findMany({
                                where: {
                                    OR: [{ senderId: ws.userId }, { receiverId: ws.userId }],
                                },
                                include: {
                                    chat: {
                                        orderBy: { createdAt: "desc" },
                                        take: 1, // Fetch only the latest message for each room
                                    },
                                },
                            });

                            if (!rooms.length) {
                                ws.send(
                                    JSON.stringify({
                                        event: "messageList",
                                        data: [],
                                    })
                                );
                                break;
                            }

                            // 2️⃣ Extract other user IDs
                            const userIds = rooms.map((room) =>
                                room.senderId === ws.userId ? room.receiverId : room.senderId
                            );

                            // 3️⃣ Fetch user info for chat partners
                            const userInfos = await prisma.user.findMany({
                                where: { id: { in: userIds } },
                                select: {
                                    id: true,
                                    fullName: true,
                                    userName: true,
                                    profileImage: true,
                                    email: true,
                                    role: true,
                                },
                            });

                            // 4️⃣ Fetch unread message counts per room
                            const unreadCounts = await prisma.chat.groupBy({
                                by: ["roomId"],
                                where: {
                                    roomId: { in: rooms.map((r) => r.id) },
                                    receiverId: ws.userId, // only messages received by this user
                                    isRead: false, // unread messages
                                },
                                _count: { _all: true },
                            });

                            // Convert unreadCounts array into an object for easy lookup
                            const unreadMap = unreadCounts.reduce((acc, cur) => {
                                acc[cur.roomId] = cur._count._all;
                                return acc;
                            }, {} as Record<string, number>);

                            // 5️⃣ Combine everything
                            const userWithLastMessages = rooms.map((room) => {
                                const otherUserId =
                                    room.senderId === ws.userId ? room.receiverId : room.senderId;
                                const userInfo = userInfos.find((u) => u.id === otherUserId);
                                const lastMessage = room.chat[0] || null;
                                const unreadCount = unreadMap[room.id] || 0;

                                return {
                                    unreadCount,
                                    user: userInfo || null,
                                    lastMessage,
                                };
                            });

                            // 6️⃣ Send result
                            ws.send(
                                JSON.stringify({
                                    event: "messageList",
                                    data: userWithLastMessages,
                                })
                            );
                        } catch (error) {
                            console.error("Error fetching user list with last messages:", error);
                            ws.send(
                                JSON.stringify({
                                    event: "error",
                                    message: "Failed to fetch users with last messages",
                                })
                            );
                        }
                        break;
                    }
                    default:
                        console.log("Unknown event type:", parsedData.event);
                }
            } catch (error) {
                console.error("Error handling WebSocket message:", error);
            }
        });

        ws.on("close", async () => {
            const extendedWs = ws as ExtendedWebSocket;
            if (extendedWs.userId) {
                const userId = extendedWs.userId;
                const role = extendedWs.role;

                // Cleanup
                onlineUsers.delete(userId);
                userSockets.delete(userId);
                broadcastToAll(wss, {
                    event: "userStatus",
                    data: { userId: userId, role: role, isOnline: false },
                });
            }
            console.log("User disconnected");
        });
    });

    return wss;
}
