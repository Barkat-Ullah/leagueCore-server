import prisma from "../shared/prisma";
import sendWaitlistOfferEmail from "./sendWaitlistOfferEmail";

// Expire old offers and move to next in queue
const expireWaitlistOffers = async () => {
  const now = new Date();

  // Find all expired offers
  const expiredOffers = await prisma.campWaitlist.findMany({
    where: {
      status: "OFFER_SENT",
      offerExpiresAt: { lt: now },
    },
  });

  for (const expired of expiredOffers) {
    await prisma.$transaction(async (tx) => {
      // Mark as expired
      await tx.campWaitlist.update({
        where: { id: expired.id },
        data: { status: "EXPIRED" },
      });

      // Get next in queue with same wait type
      const nextInQueue = await tx.campWaitlist.findFirst({
        where: {
          scheduleSessionIds: { hasSome: expired.scheduleSessionIds },
          waitlistType: expired.waitlistType,
          status: "ACTIVE",
          queuePosition: { gt: expired.queuePosition },
        },
        orderBy: { queuePosition: "asc" },
      });

      if (nextInQueue) {
        // Auto-offer to next person
        await tx.campWaitlist.update({
          where: { id: nextInQueue.id },
          data: {
            status: "OFFER_SENT",
            notifiedAt: new Date(),
            offerExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });

        // Send email to next person asynchronously
        sendWaitlistOfferEmail(nextInQueue.id).catch(err =>
          console.error("Failed to send offer email to next person:", err)
        );
      }
    });
  }

  return { expiredCount: expiredOffers.length };
};

export default expireWaitlistOffers;
