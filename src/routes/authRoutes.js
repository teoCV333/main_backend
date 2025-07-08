import express from "express";
import { register, login } from "../controllers/authController.js";
//import { validateLogin, validateRegister } from "../middlewares/validateMiddleware.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);

export default router;