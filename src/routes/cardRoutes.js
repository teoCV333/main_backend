import express from "express";
import { validateBank } from "../controllers/cardController.js";
//import { validateLogin, validateRegister } from "../middlewares/validateMiddleware.js";

const router = express.Router();

router.get("/redirect/:bin", validateBank);

export default router;