import express from "express";
import auth from "../../middlewares/auth";
import { fileUploader } from "../../../helpars/fileUploader";
import { generateSupportMessageEmail } from "../../../shared/emailHTML";
import emailSender from "../../../shared/emailSender";
import config from "../../../config";
import validateRequest from "../../middlewares/validateRequest";
import { userValidation } from "./user.validation";
import { userController } from "./user.controller";

const router = express.Router();

// *!register user
router.post(
  "/",
  validateRequest(userValidation.createSchema),
  userController.createUser,
);

// Get all  user
router.get("/", userController.getUsers);
router.get("/admin/home-page", userController.dashboardData);

// Get user by id
router.get("/:id", userController.getUserById);

// Update user's own Profile
router.put(
  "/profile",
  auth(),
  fileUploader.uploadSingle,
  validateRequest(userValidation.updateSchema),
  userController.updateProfile,
);

//Delete user
router.patch("/delete/:id", auth(), userController.softDeleteUser);

//Toggle Block
router.put("/toggle-block/:id", auth(), userController.toggleBlock);

// Support - USer message to admin
router.post("/support/message", async (req, res) => {
  try {
    const { email, name, phone, message } = req.body;

    if (!email || !name || !phone || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const html = generateSupportMessageEmail({
      email,
      name,
      phone,
      message,
    });

    await emailSender(
      `${config.admin_email}`,
      html,
      "Support Message From User",
    );

    res.json({ success: true, message: "Message sent to admin" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Upload photo
router.post(
  "/upload-photo",
  fileUploader.uploadSingle,
  auth(),
  userController.uploadPhoto,
);

// Update player profile
router.put(
  "/player/profile/:id",
  fileUploader.uploadSingle,
  auth(),
  userController.updatePlayerProfile,
);

// Get activity logs
router.get("/activity/logs", auth(), userController.getActivityLogs);

export const userRoutes = router;
