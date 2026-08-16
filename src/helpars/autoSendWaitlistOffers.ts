import prisma from "../shared/prisma";
import sendWaitlistOfferEmail from "./sendWaitlistOfferEmail";

const autoSendWaitlistOffers = async () => {
  try {
    const sessions = await prisma.scheduleSession.findMany();

    const availableSessions = sessions.filter(
      (s) => s.capacity - s.totalRegistered > 0,
    );

    if (!availableSessions.length) return;

    const availableSessionIds = availableSessions.map((s) => s.id);

    const [activeEntries, existingOffers] = await Promise.all([
      prisma.campWaitlist.findMany({
        where: {
          scheduleSessionIds: { hasSome: availableSessionIds },
          status: "ACTIVE",
        },
        orderBy: { queuePosition: "asc" },
      }),
      prisma.campWaitlist.findMany({
        where: {
          scheduleSessionIds: { hasSome: availableSessionIds },
          status: "OFFER_SENT",
          offerExpiresAt: { gt: new Date() },
        },
        select: { scheduleSessionIds: true },
      }),
    ]);

    const offeredSessionIds = new Set(
      existingOffers.flatMap((o) => o.scheduleSessionIds),
    );
    const alreadyOfferedEntryIds = new Set<string>();
    const updatesToRun: Array<{ id: string; offerExpiresAt: Date }> = [];

    for (const session of availableSessions) {
      if (offeredSessionIds.has(session.id)) continue;

      const entry = activeEntries.find(
        (e) =>
          !alreadyOfferedEntryIds.has(e.id) &&
          e.scheduleSessionIds.includes(session.id),
      );

      if (!entry) continue;

      alreadyOfferedEntryIds.add(entry.id);

      const offerExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      updatesToRun.push({ id: entry.id, offerExpiresAt });
    }

    await Promise.all(
      updatesToRun.map(({ id, offerExpiresAt }) =>
        prisma.campWaitlist
          .update({
            where: { id },
            data: {
              status: "OFFER_SENT",
              notifiedAt: new Date(),
              offerExpiresAt,
            },
          })
          .then(() => {
            sendWaitlistOfferEmail(id).catch((err) =>
              console.error("Waitlist offer email error:", err),
            );
          }),
      ),
    );
  } catch (error) {
    console.error("Auto-send waitlist offers error:", error);
  }
};

export default autoSendWaitlistOffers;
