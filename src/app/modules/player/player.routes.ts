import express from "express";
import auth from "../../middlewares/auth";
import { playerController } from "./player.controller";

const router = express.Router();

router.get("/", auth(), playerController.getPlayerList);
router.get("/dashboard", auth(), playerController.getDashboard);
router.get("/schedule", auth(), playerController.getSchedule);
router.post("/", auth(), playerController.addPlayer);

export const playerRoutes = router;
