import cron from "node-cron";
import prisma from "./prisma";
import { UserRole } from "@prisma/client";
import autoSendWaitlistOffers from "../helpars/autoSendWaitlistOffers";
import expireWaitlistOffers from "../helpars/expireWaitlistOffers";
import { notificationQueue } from "../lib/queue/queues";
import { CacheInvalidator } from "../lib/redis";

// --------------------
// helpers
// --------------------
const uniq = (arr: (string | null | undefined)[]) =>
    Array.from(new Set(arr.filter(Boolean) as string[]));

const MS_MIN = 60_000;
const MS_HOUR = 60 * MS_MIN;

const formatMatchTime = (d: Date) => d.toISOString();

// --------------------
// main cron starter
// --------------------
export const startCrons = () => {
    // 🔹 Automatically set users inactive if not logged in for 3 months
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const updateUserStatus = async () => {
        const targets = await prisma.user.findMany({
            where: {
                lastLoginAt: { lt: threeMonthsAgo },
                status: "ACTIVE",
            },
            select: { id: true },
        });

        if (!targets.length) return;

        await prisma.user.updateMany({
            where: {
                lastLoginAt: { lt: threeMonthsAgo },
                status: "ACTIVE",
            },
            data: { status: "INACTIVE" },
        });

        // Clear cached auth status for affected users
        await Promise.all(
            targets.map((u) => CacheInvalidator.onRecordUpdate("user", u.id))
        );
    };

    // 🔹 Reactivate suspended users
    const reactivateSuspendedUsers = async () => {
        const now = new Date();

        const targets = await prisma.user.findMany({
            where: {
                status: "SUSPENDED",
                suspendedUntil: { lte: now },
            },
            select: { id: true },
        });

        if (!targets.length) return;

        await prisma.user.updateMany({
            where: {
                status: "SUSPENDED",
                suspendedUntil: { lte: now },
            },
            data: {
                status: "ACTIVE",
                suspendedUntil: null,
            },
        });

        // Clear cached auth status for restored users
        await Promise.all(
            targets.map((u) => CacheInvalidator.onRecordUpdate("user", u.id))
        );
    };

    // ✅ Match reminders (T-6 hours)
    const sendMatchRemindersTMinus6H = async () => {
        const now = new Date();

        const target = new Date(now.getTime() + 6 * MS_HOUR);
        const windowStart = new Date(target.getTime() - 1 * MS_MIN);
        const windowEnd = new Date(target.getTime() + 1 * MS_MIN);

        const matches = await prisma.match.findMany({
            where: {
                isPublished: true,
                scheduledAt: { gte: windowStart, lt: windowEnd },
                status: { in: ["SCHEDULED"] },
            },
            select: {
                id: true,
                scheduledAt: true,
                field: true,
                stage: true,
                round: true,
                tournament: { select: { name: true } },
                division: { select: { divisionName: true } },

                homeTeam: {
                    select: {
                        teamName: true,
                        userId: true,
                        teamId: true,
                        teamplayers: {
                            where: { isDeletedTeamPlayer: false },
                            select: { playerId: true },
                        },
                    },
                },

                awayTeam: {
                    select: {
                        teamName: true,
                        userId: true,
                        teamId: true,
                        teamplayers: {
                            where: { isDeletedTeamPlayer: false },
                            select: { playerId: true },
                        },
                    },
                },
            },
        });

        if (!matches.length) return;

        // Admins (already gated)
        const admins = await prisma.user.findMany({
            where: {
                role: UserRole.ADMIN,
                status: "ACTIVE",
                isDeleted: false,
                isMatchReminderNotify: true,
            },
            select: { id: true },
        });
        const adminIds = admins.map((a) => a.id);

        for (const m of matches) {
            // Coaches gated
            const coachCandidateIds = uniq([m.homeTeam.userId, m.awayTeam.userId]);
            const coachAllowed = coachCandidateIds.length
                ? await prisma.user.findMany({
                    where: {
                        id: { in: coachCandidateIds },
                        status: "ACTIVE",
                        isDeleted: false,
                        isMatchReminderNotify: true,
                    },
                    select: { id: true },
                })
                : [];
            const coachIds = coachAllowed.map((u) => u.id);

            // Players gated
            const playerCandidateIds = uniq([
                ...m.homeTeam.teamplayers.map((tp) => tp.playerId),
                ...m.awayTeam.teamplayers.map((tp) => tp.playerId),
            ]);
            const playerAllowed = playerCandidateIds.length
                ? await prisma.user.findMany({
                    where: {
                        id: { in: playerCandidateIds },
                        status: "ACTIVE",
                        isDeleted: false,
                        isMatchReminderNotify: true,
                    },
                    select: { id: true },
                })
                : [];
            const playerIds = playerAllowed.map((u) => u.id);

            // Managers gated
            const teamIds = uniq([m.homeTeam.teamId, m.awayTeam.teamId]);
            const managers = teamIds.length
                ? await prisma.teamManager.findMany({
                    where: { teamId: { in: teamIds } },
                    select: { managerId: true },
                })
                : [];
            const managerCandidateIds = uniq(managers.map((x) => x.managerId));
            const managerAllowed = managerCandidateIds.length
                ? await prisma.user.findMany({
                    where: {
                        id: { in: managerCandidateIds },
                        status: "ACTIVE",
                        isDeleted: false,
                        isMatchReminderNotify: true,
                    },
                    select: { id: true },
                })
                : [];
            const managerIds = managerAllowed.map((u) => u.id);

            const recipientIds = uniq([...adminIds, ...coachIds, ...playerIds, ...managerIds]);
            if (!recipientIds.length) continue;

            const when = formatMatchTime(m.scheduledAt);

            const title = "Match Reminder";
            const body = [
                `Tournament: ${m.tournament?.name ?? "N/A"}`,
                `Division: ${m.division?.divisionName ?? "N/A"}`,
                `Stage: ${m.stage}${typeof m.round === "number" ? ` (Round ${m.round})` : ""}`,
                `Match: ${m.homeTeam.teamName} vs ${m.awayTeam.teamName}`,
                `Time: ${when}`,
                m.field ? `Field: ${m.field}` : null,
            ]
                .filter(Boolean)
                .join("\n");

            await prisma.notification.createMany({
                data: recipientIds.map((userId) => ({
                    userId,
                    title,
                    body,
                    data: JSON.stringify({
                        type: "MATCH_REMINDER",
                        matchId: m.id,
                        remindType: "T_MINUS_6H",
                        scheduledAt: m.scheduledAt,
                        teamIds,
                    }),
                })),
            });
        }
    };

    // ✅ Waiver sign alerts (players only)
    // Rule: if player isWavierAlertNotify=true AND teamplayer is not signed (isAgree=false)
    // Dedupe: don't re-alert the same teamplayer within 24h (waiverSentAt stamp)
    const sendWaiverSignAlerts = async () => {
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * MS_HOUR);

        // Filtering lives entirely in the query: active non-deleted players who
        // opted in, unsigned waivers, and no successful alert within the last 24h.
        const pending = await prisma.teamplayer.findMany({
            where: {
                isDeletedTeamPlayer: false,
                isAgree: false, // not signed
                player: {
                    is: {
                        isDeleted: false,
                        status: "ACTIVE",
                        isWavierAlertNotify: true,
                    },
                },
                OR: [{ waiverSentAt: null }, { waiverSentAt: { lt: last24h } }],
            },
            select: {
                id: true,
                playerId: true,
                teamregistrationId: true,
                player: {
                    select: {
                        id: true,
                        fullName: true,
                    },
                },
            },
            take: 2000, // safety cap; add pagination if needed
        });

        if (!pending.length) return;

        const processedIds = pending.map((tp) => tp.id);
        const recipientIds = pending
            .map((tp) => tp.player?.id)
            .filter((id): id is string => Boolean(id));

        if (!recipientIds.length) return;

        // One batch job — the notification worker performs createMany for all recipients.
        const job = await notificationQueue.add(
            "waiver-alert-batch",
            {
                recipientIds,
                title: "Waiver Signature Required",
                body: "Please sign your waiver to stay eligible for matches.",
                data: JSON.stringify({
                    type: "WAIVER_ALERT",
                    teamplayerIds: processedIds,
                }),
            },
            { attempts: 3 }
        );

        // Bulk-stamp processed rows only after the batch was successfully enqueued,
        // so a failed enqueue means the next run re-attempts the same recipients.
        await prisma.teamplayer.updateMany({
            where: { id: { in: processedIds } },
            data: { waiverSentAt: now },
        });

        console.log(
            `✅ Waiver alert batch enqueued (job ${job.id}): ${recipientIds.length} recipient(s)`
        );
    };

    // 🔹 Auto-expire offers after 24 hours
    const autoExpireWaitlistOffers = async () => {
        try {
            await expireWaitlistOffers();
        } catch (error) {
            console.error("Auto-expire waitlist offers error:", error);
        }
    };

    // sync SchedulePeriod status based on its own startDate / endDate fields
    const syncSchedulePeriodStatuses = async () => {
        const now = new Date();

        // Periods within their date range → ACTIVE
        await prisma.schedulePeriod.updateMany({
            where: {
                status: { not: "ACTIVE" },
                isDeleted: false,
                startDate: { lte: now },
                endDate: { gte: now },
            },
            data: { status: "ACTIVE" },
        });

        // Periods past their endDate → CLOSED
        await prisma.schedulePeriod.updateMany({
            where: {
                status: { not: "CLOSED" },
                isDeleted: false,
                endDate: { lt: now },
            },
            data: { status: "CLOSED" },
        });
    };

    // also sync ScheduleWeek status the same way
    const syncScheduleWeekStatuses = async () => {
        const now = new Date();
        
        await prisma.scheduleWeek.updateMany({
            where: { status: { not: "CLOSED" }, endDate: { lt: now } },
            data: { status: "CLOSED" },
        });
    };

    // --------------------
    // schedules
    // --------------------
    cron.schedule("0 0 * * *", updateUserStatus); // daily midnight
    cron.schedule("0 0 * * *", reactivateSuspendedUsers); // daily midnight

    // match reminders: every minute (tight window)
    cron.schedule("* * * * *", async () => {
        try {
            await sendMatchRemindersTMinus6H();
        } catch (e) {
            console.error("Match reminder cron error:", e);
        }
    });

    // waiver alerts: every day at 09:00 server time (adjust as you want)
    cron.schedule("0 9 * * *", async () => { // daily 9am
        try {
            await sendWaiverSignAlerts();
        } catch (e) {
            console.error("Waiver alert cron error:", e);
        }
    });

    // auto-send waitlist offers: every 30 minutes
    cron.schedule("*/30 * * * *", async () => {
        try {
            await autoSendWaitlistOffers();
        } catch (e) {
            console.error("Auto-send waitlist offers cron error:", e);
        }
    });

    // auto-expire waitlist offers: every hour
    cron.schedule("0 * * * *", async () => {
        try {
            await autoExpireWaitlistOffers();
        } catch (e) {
            console.error("Auto-expire waitlist offers cron error:", e);
        }
    });

    // schedule status syncs: daily at midnight
    cron.schedule("0 0 * * *", async () => {
        try {
            await syncSchedulePeriodStatuses();
        } catch (e) {
            console.error("Schedule period status sync cron error:", e);
        }
    });

    cron.schedule("0 0 * * *", async () => {
        try {
            await syncScheduleWeekStatuses();
        } catch (e) {
            console.error("Schedule week status sync cron error:", e);
        }
    });

    console.log("⏰ Cron jobs started");
};
