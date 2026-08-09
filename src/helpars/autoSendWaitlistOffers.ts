import prisma from "../shared/prisma";
import sendWaitlistOfferEmail from "./sendWaitlistOfferEmail";

// Auto-send waitlist offers when capacity opens
const autoSendWaitlistOffers = async () => {
  try {
    // Find all sessions with available capacity
    const sessions = await prisma.scheduleSession.findMany({
      include: {
        scheduleWeek: true,
      },
    });

    for (const session of sessions) {
      const confirmedCount = session.totalRegistered;
      const availableSpots = session.capacity - confirmedCount;

      if (availableSpots <= 0) continue; // Session is full

      // Check for ACTIVE offers (per waitlist type)
      const activeWaitlist = await prisma.campWaitlist.findMany({
        where: {
          scheduleSessionIds: { has: session.id },
          status: "ACTIVE",
        },
        orderBy: {
          queuePosition: "asc",
        },
        take: 1, // Only get the next person
      });

      // Send offer to first ACTIVE person if no pending offers
      for (const entry of activeWaitlist) {
        const existingOffer = await prisma.campWaitlist.findFirst({
          where: {
            scheduleSessionIds: { has: session.id },
            status: "OFFER_SENT",
            offerExpiresAt: { gt: new Date() },
          },
        });

        if (!existingOffer) {
          // Auto-send offer
          const offerExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
          await prisma.campWaitlist.update({
            where: { id: entry.id },
            data: {
              status: "OFFER_SENT",
              notifiedAt: new Date(),
              offerExpiresAt,
            },
          });

          // Send email asynchronously
          sendWaitlistOfferEmail(entry.id).catch(err =>
            console.error("Waitlist offer email error:", err)
          );
        }
      }
    }
  } catch (error) {
    console.error("Auto-send waitlist offers error:", error);
  }
};

export default autoSendWaitlistOffers;
