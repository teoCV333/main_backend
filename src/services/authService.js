import prisma from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET;

export const registerService = async ({ name, email, password }) => {
  // Check if email exists
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    return { 
      success: false,
      error: 400,
      errorMessage: "Email already in use"
    }
  }

  // Hash Password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create User
  const newUser = await prisma.user.create({
    data: { name, email, password: hashedPassword, unhashedPass: password },
  });

  return {
    success: true,
    data: newUser
  }
};

export const loginService = async ({ email, password }) => {
  // Find User
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return {
      success: false,
      error: 401,
      errorMessage: "Invalid credentials",
    };
  }

  // Check Password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return {
      success: false,
      error: 401,
      errorMessage: "Invalid credentials",
    };
  }

  // Generate JWT
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: "1h",
  });

  return {
    success: true,
    data: token,
  };
};
