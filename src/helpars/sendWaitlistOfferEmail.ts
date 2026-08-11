import prisma from "../shared/prisma";
import { enqueueEmail } from "../shared/emailSender";
import { waitlistOfferEmail } from "../shared/emailHTML";

// Send offer email to waitlist entry
const sendWaitlistOfferEmail = async (waitlistId: string, registrationId?: string) => {
  const result = await prisma.campWaitlist.findUnique({
    where: { id: waitlistId },
  });

  if (!result) return;

  const sessionTime = "9:00 AM - 12:00 PM, 3 days per week";

  const totalAmount = 225 * result.numberOfKids * result.numberOfWeeks;

  const expiryTime = result.offerExpiresAt?.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Use provided registrationId or look it up by parentEmail + scheduleSessionId
  const resolvedRegistrationId = registrationId ?? (await prisma.campRegistration.findFirst({
    where: {
      parentEmail: result.parentEmail,
      scheduleSessionIds: { hasSome: result.scheduleSessionIds },
      status: "PENDING_PAYMENT",
    },
    orderBy: { createdAt: "desc" },
  }))?.id;

  const confirmLink = resolvedRegistrationId
    ? `${process.env.FRONTEND_BASE_URL}/proving-camp/payment?registrationId=${resolvedRegistrationId}`
    : `${process.env.FRONTEND_BASE_URL}/proving-camp/payment?waitlistId=${result.id}`;

  // Send email (queued for background worker)
  try {
    await enqueueEmail({
      to: result.parentEmail,
      subject: "You're Invited! A Spot Opened Up in Camp - Offer Expires in 24 Hours",
      html: waitlistOfferEmail({
        parentName: result.parentName,
        sessionTime,
        amount: totalAmount,
        offerExpiresAt: expiryTime || "Unknown",
        confirmLink,
      }),
    });
  } catch (error) {
    console.error("Failed to enqueue waitlist offer email:", error);
  }
};

export default sendWaitlistOfferEmail;
