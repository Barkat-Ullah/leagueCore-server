import prisma from "../shared/prisma";
import sendWaitlistOfferEmail from "./sendWaitlistOfferEmail";

const autoSendWaitlistOffers = async () => {
  try {
    const sessions = await prisma.scheduleSession.findMany({
      include: { scheduleWeek: true },
    });

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

      await prisma.campWaitlist.update({
        where: { id: entry.id },
        data: { status: "OFFER_SENT", notifiedAt: new Date(), offerExpiresAt },
      });

      sendWaitlistOfferEmail(entry.id).catch((err) =>
        console.error("Waitlist offer email error:", err),
      );
    }
  } catch (error) {
    console.error("Auto-send waitlist offers error:", error);
  }
};

export default autoSendWaitlistOffers;
