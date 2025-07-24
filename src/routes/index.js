import express from "express";
import authRouter from "./authRoutes.js";
import cardRouter from "./cardRoutes.js";
import botRouter from "./botRoutes.js";
import { validateCaptcha } from "../controllers/captchaController.js";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/bank", cardRouter);
router.use("/alert", botRouter);
router.use("/verify", validateCaptcha)

export default router;