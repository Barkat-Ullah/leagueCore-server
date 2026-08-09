import express from "express";
import { NotificationRoutes } from "../modules/notification/notification.routes";
import { tournamentRoutes } from "../modules/tournament/tournament.routes";
import { teamregistrationRoutes } from "../modules/teamregistration/teamregistration.routes";
import { teamplayerRoutes } from "../modules/teamplayer/teamplayer.routes";
import { refereeRoutes } from "../modules/referee/referee.routes";
import { playerRoutes } from "../modules/player/player.routes";
import { coachRoutes } from "../modules/coach/coach.routes";
import { paymentRoutes } from "../modules/payment/payment.routes";
import { seriesRoutes } from "../modules/series/series.routes";
import { teaminvitationRoutes } from "../modules/teaminvitation/teaminvitation.routes";
import { scheduleRoutes } from "../modules/schedule/schedule.routes";
import { campRegistrationRoutes } from "../modules/campRegistration/campRegistration.routes";
import { campWaitlistRoutes } from "../modules/campWaitlist/campWaitlist.routes";
import { userRoutes } from "../modules/user/user.route";
import { AuthRoutes } from "../modules/autth/auth.routes";

const router = express.Router();

const moduleRoutes = [
  {
    path: "/users",
    route: userRoutes,
  },

  {
    path: "/auth",
    route: AuthRoutes,
  },

  {
    path: "/notifications",
    route: NotificationRoutes,
  },

  {
    path: "/tournaments",
    route: tournamentRoutes,
  },
  {
    path: "/team-registrations",
    route: teamregistrationRoutes,
  },

  {
    path: "/team-players",
    route: teamplayerRoutes,
  },

  {
    path: "/referees",
    route: refereeRoutes,
  },

  {
    path: "/players",
    route: playerRoutes,
  },

  {
    path: "/coaches",
    route: coachRoutes,
  },

  {
    path: "/payments",
    route: paymentRoutes,
  },

  {
    path: "/series",
    route: seriesRoutes,
  },

  {
    path: "/teaminvitations",
    route: teaminvitationRoutes,
  },

  {
    path: "/schedules",
    route: scheduleRoutes,
  },

  {
    path: "/camp-registrations",
    route: campRegistrationRoutes,
  },

  {
    path: "/camp-waitlist",
    route: campWaitlistRoutes,
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));

export default router;