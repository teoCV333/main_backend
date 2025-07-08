import express from "express";
import authRouter from "./authRoutes.js";
import cardRouter from "./cardRoutes.js";
import botRouter from "./botRoutes.js";

const router = express.Router();

router.use("/auth", authRouter);
router.use("/bank", cardRouter);
router.use("/alert", botRouter);

export default router;