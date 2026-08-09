import prisma from "../shared/prisma";
import sendWaitlistOfferEmail from "./sendWaitlistOfferEmail";

const expireWaitlistOffers = async () => {
  const now = new Date();

  // Snapshot exactly which rows are expiring in THIS run only
  const toExpire = await prisma.campWaitlist.findMany({
    where: { status: "OFFER_SENT", offerExpiresAt: { lt: now } },
    select: {
      id: true,
      scheduleSessionIds: true,
      waitlistType: true,
      queuePosition: true,
    },
  });

  if (!toExpire.length) return { expiredCount: 0 };

  await prisma.campWaitlist.updateMany({
    where: { id: { in: toExpire.map((e) => e.id) } },
    data: { status: "EXPIRED" },
  });

  // Promote next-in-queue using ONLY this run's snapshot —
  // never re-query by status:"EXPIRED", that would re-catch past runs' rows
  for (const item of toExpire) {
    const nextInQueue = await prisma.campWaitlist.findFirst({
      where: {
        scheduleSessionIds: { hasSome: item.scheduleSessionIds },
        waitlistType: item.waitlistType,
        status: "ACTIVE",
        queuePosition: { gt: item.queuePosition },
      },
      orderBy: { queuePosition: "asc" },
    });

    if (!nextInQueue) continue;

    const offerExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.campWaitlist.update({
      where: { id: nextInQueue.id },
      data: { status: "OFFER_SENT", notifiedAt: new Date(), offerExpiresAt },
    });

    sendWaitlistOfferEmail(nextInQueue.id).catch((err) =>
      console.error("Failed to send offer email to next person:", err),
    );
  }

  return { expiredCount: toExpire.length };
};

export default expireWaitlistOffers;
