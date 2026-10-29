import jwt from "jsonwebtoken";

import { db } from "../database/index.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  hashPassword,
  isPasswordCorrect,
} from "../utils/bcrypt.js";
import {
  generateAccessAndRefreshTokens,
} from "../utils/tokens.js";

const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// REGISTER USER
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (
    !name?.trim() ||
    !email?.trim() ||
    !password?.trim() ||
    phone === undefined ||
    phone === null ||
    !String(phone).trim()
  ) {
    throw new ApiError(400, "All fields are required");
  }

  const cleanName = name.trim();
  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = String(phone).trim();

  const [existingUser] = await db.execute(
    "SELECT id FROM users WHERE email = ? OR phone = ?",
    [cleanEmail, cleanPhone]
  );

  if (existingUser.length > 0) {
    throw new ApiError(
      409,
      "User with given email or phone number already exists"
    );
  }

  const hashedPassword = await hashPassword(password);

  await db.execute(
    `INSERT INTO users (name, email, password_hash, phone)
     VALUES (?, ?, ?, ?)`,
    [cleanName, cleanEmail, hashedPassword, cleanPhone]
  );

  const [createdUser] = await db.execute(
    `SELECT name, email, phone, created_at
     FROM users
     WHERE email = ?`,
    [cleanEmail]
  );

  if (createdUser.length === 0) {
    throw new ApiError(500, "Something went wrong while creating user");
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      createdUser[0],
      "User registered successfully"
    )
  );
});

// LOGIN USER
const loginUser = asyncHandler(async (req, res) => {
  const { email, phone, password } = req.body;

  const cleanEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  const cleanPhone =
    phone !== undefined && phone !== null
      ? String(phone).trim()
      : "";

  if (!cleanEmail && !cleanPhone) {
    throw new ApiError(400, "Email or phone number is required");
  }

  if (typeof password !== "string" || !password.trim()) {
    throw new ApiError(400, "Password is required");
  }

  let data;

  if (cleanEmail && cleanPhone) {
    [data] = await db.execute(
      `SELECT id, email, phone, name, password_hash
       FROM users
       WHERE email = ? AND phone = ?`,
      [cleanEmail, cleanPhone]
    );
  } else if (cleanEmail) {
    [data] = await db.execute(
      `SELECT id, email, phone, name, password_hash
       FROM users
       WHERE email = ?`,
      [cleanEmail]
    );
  } else {
    [data] = await db.execute(
      `SELECT id, email, phone, name, password_hash
       FROM users
       WHERE phone = ?`,
      [cleanPhone]
    );
  }

  if (!data || data.length === 0) {
    throw new ApiError(401, "Invalid email/phone or password");
  }

  const user = data[0];

  const isPasswordValid = await isPasswordCorrect(
    user.password_hash,
    password
  );

  if (!isPasswordValid) {
    throw new ApiError(401, "Invalid email/phone or password");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshTokens(user);

  const [loggedInUsers] = await db.execute(
    `SELECT id, name, email, phone, created_at
     FROM users
     WHERE id = ?`,
    [user.id]
  );

  if (!loggedInUsers || loggedInUsers.length === 0) {
    throw new ApiError(500, "Unable to fetch logged-in user");
  }

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUsers[0],
          accessToken,
          refreshToken,
        },
        "User logged in successfully"
      )
    );
});

// LOGOUT USER
const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id ?? req.user?.[0]?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  const [users] = await db.execute(
    "SELECT id FROM users WHERE id = ?",
    [userId]
  );

  if (users.length === 0) {
    throw new ApiError(404, "User to be logged out not found");
  }

  await db.execute(
    "UPDATE users SET refresh_token = NULL WHERE id = ?",
    [userId]
  );

  const clearCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };

  return res
    .status(200)
    .clearCookie("accessToken", clearCookieOptions)
    .clearCookie("refreshToken", clearCookieOptions)
    .json(
      new ApiResponse(200, {}, "User logged out successfully")
    );
});

// REFRESH ACCESS TOKEN
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Refresh token is required");
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const userId = decodedToken?.userId ?? decodedToken?.id;

  if (!userId) {
    throw new ApiError(401, "Invalid refresh token payload");
  }

  const [users] = await db.execute(
    "SELECT id, refresh_token FROM users WHERE id = ?",
    [userId]
  );

  if (users.length === 0) {
    throw new ApiError(401, "User not found");
  }

  if (incomingRefreshToken !== users[0].refresh_token) {
    throw new ApiError(401, "Refresh token is expired or has been used");
  }

  // This utility should save the newly generated refresh token in the DB.
  const {
    accessToken,
    refreshToken: newRefreshToken,
  } = await generateAccessAndRefreshTokens(users[0]);

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", newRefreshToken, cookieOptions)
    .json(
      new ApiResponse(
        200,
        {
          accessToken,
          refreshToken: newRefreshToken,
        },
        "Access token refreshed successfully"
      )
    );
});

// GET CURRENT USER
const getCurrentUser = asyncHandler(async (req, res) => {
  if (!req.user) {
    throw new ApiError(401, "Unauthorized request");
  }

  const user = Array.isArray(req.user) ? req.user[0] : req.user;

  return res.status(200).json(
    new ApiResponse(
      200,
      user,
      "Current user fetched successfully"
    )
  );
});

export {
  registerUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  refreshAccessToken,
};