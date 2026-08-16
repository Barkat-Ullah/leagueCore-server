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

  // Batched to avoid N+1: fetch all active candidates once, then resolve each expired row's next-in-line in memory.
  const relevantSessionIds = Array.from(
    new Set(toExpire.flatMap((item) => item.scheduleSessionIds)),
  );
  const relevantWaitlistTypes = Array.from(
    new Set(toExpire.map((item) => item.waitlistType)),
  );

  const activeCandidates = relevantSessionIds.length
    ? await prisma.campWaitlist.findMany({
        where: {
          scheduleSessionIds: { hasSome: relevantSessionIds },
          status: "ACTIVE",
          ...(relevantWaitlistTypes.length
            ? { waitlistType: { in: relevantWaitlistTypes } }
            : {}),
        },
        select: {
          id: true,
          scheduleSessionIds: true,
          waitlistType: true,
          queuePosition: true,
        },
        orderBy: { queuePosition: "asc" },
      })
    : [];

  const nextSelections = new Map<
    string,
    {
      id: string;
      data: { status: "OFFER_SENT"; notifiedAt: Date; offerExpiresAt: Date };
    }
  >();

  // Track candidates already claimed by an earlier expired item in this same batch,
  // so two expired offers can't both be assigned to the same next-in-line person.
  const claimedCandidateIds = new Set<string>();

  for (const item of toExpire) {
    const itemSessionSet = new Set(item.scheduleSessionIds);
    const eligibleCandidates = activeCandidates
      .filter(
        (candidate) =>
          !claimedCandidateIds.has(candidate.id) &&
          candidate.waitlistType === item.waitlistType &&
          candidate.queuePosition > item.queuePosition &&
          candidate.scheduleSessionIds.some((sessionId) =>
            itemSessionSet.has(sessionId),
          ),
      )
      .sort((a, b) => a.queuePosition - b.queuePosition);

    if (!eligibleCandidates.length) continue;

    const nextInQueue = eligibleCandidates[0];
    claimedCandidateIds.add(nextInQueue.id);

    const offerExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const payload = {
      status: "OFFER_SENT" as const,
      notifiedAt: new Date(),
      offerExpiresAt,
    };

    nextSelections.set(nextInQueue.id, { id: nextInQueue.id, data: payload });
  }

  const promotions = Array.from(nextSelections.values());

  for (const promotion of promotions) {
    await prisma.campWaitlist.update({
      where: { id: promotion.id },
      data: promotion.data,
    });

    sendWaitlistOfferEmail(promotion.id).catch((err) =>
      console.error("Failed to send offer email to next person:", err),
    );
  }

  return { expiredCount: toExpire.length };
};

export default expireWaitlistOffers;
