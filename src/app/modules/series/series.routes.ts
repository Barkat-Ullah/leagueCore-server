import express from "express";
import auth from "../../middlewares/auth";
import { seriesController } from "./series.controller";
import validateRequest from "../../middlewares/validateRequest";
import { seriesValidation } from "./series.validation";

const router = express.Router();

router.post("/", auth(), validateRequest(seriesValidation.createSchema), seriesController.createSeries);

router.get("/", auth(), seriesController.getSeriesList);

router.get("/get/by/userId", auth(), seriesController.getSeriesByUserId);

router.put("/:id", auth(), validateRequest(seriesValidation.updateSchema), seriesController.updateSeries);

router.delete("/:id", auth(), seriesController.deleteSeries);

export const seriesRoutes = router;
