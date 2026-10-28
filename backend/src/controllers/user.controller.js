
import jwt from "jsonwebtoken";
import { db } from "../database/index.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  hashPassword,
  isPasswordCorrect,
} from "../utils/bcrypt.js";

// Cookie configuration
const isProduction = process.env.NODE_ENV === "production";

const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: "lax",
  path: "/",
};

const accessCookieOptions = {
  ...cookieOptions,
  maxAge: 24 * 60 * 60 * 1000, // 1 day
};

const refreshCookieOptions = {
  ...cookieOptions,
  maxAge: 10 * 24 * 60 * 60 * 1000, // 10 days
};

// JWT generation
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY,
    }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY,
    }
  );
};

// REGISTER USER
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof email !== "string" ||
    !email.trim() ||
    typeof password !== "string" ||
    !password
  ) {
    throw new ApiError(
      400,
      "Name, email, and password are required"
    );
  }

  if (password.length < 8) {
    throw new ApiError(
      400,
      "Password must be at least 8 characters long"
    );
  }

  if (
    phone !== undefined &&
    phone !== null &&
    (typeof phone !== "string" || !phone.trim())
  ) {
    throw new ApiError(
      400,
      "Phone must be a non-empty string"
    );
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPhone = phone?.trim() || null;

  const [existingUsers] = await db.execute(
    `SELECT id
     FROM users
     WHERE email = ?
        OR (? IS NOT NULL AND phone = ?)
     LIMIT 1`,
    [
      normalizedEmail,
      normalizedPhone,
      normalizedPhone,
    ]
  );

  if (existingUsers.length > 0) {
    throw new ApiError(
      409,
      "Email or phone number is already registered"
    );
  }

  const hashedPassword = await hashPassword(password);

  const [result] = await db.execute(
    `INSERT INTO users
      (name, email, password_hash, phone)
     VALUES (?, ?, ?, ?)`,
    [
      normalizedName,
      normalizedEmail,
      hashedPassword,
      normalizedPhone,
    ]
  );

  const [createdUsers] = await db.execute(
    `SELECT id, name, email, phone, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [result.insertId]
  );

  if (createdUsers.length === 0) {
    throw new ApiError(
      500,
      "Something went wrong while registering the user"
    );
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      createdUsers[0],
      "User registered successfully"
    )
  );
});

// LOGIN USER
const loginUser = asyncHandler(async (req, res) => {
  const { email, phone, password } = req.body;

  if (typeof password !== "string" || !password) {
    throw new ApiError(400, "Password is required");
  }

  let identifier;

  if (typeof email === "string" && email.trim()) {
    identifier = {
      column: "email",
      value: email.trim().toLowerCase(),
    };
  } else if (typeof phone === "string" && phone.trim()) {
    identifier = {
      column: "phone",
      value: phone.trim(),
    };
  } else {
    throw new ApiError(
      400,
      "Email or phone number is required"
    );
  }

  // Column name comes only from the fixed choices above.
  const [users] = await db.execute(
    `SELECT id, name, email, phone, password_hash
     FROM users
     WHERE ${identifier.column} = ?
     LIMIT 1`,
    [identifier.value]
  );

  if (users.length === 0) {
    throw new ApiError(
      401,
      "Invalid email/phone or password"
    );
  }

  const user = users[0];

  const passwordIsValid = await isPasswordCorrect(
    password,
    user.password_hash
  );

  if (!passwordIsValid) {
    throw new ApiError(
      401,
      "Invalid email/phone or password"
    );
  }

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  await db.execute(
    `UPDATE users
     SET refresh_token = ?
     WHERE id = ?`,
    [refreshToken, user.id]
  );

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
  };

  return res
    .status(200)
    .cookie(
      "accessToken",
      accessToken,
      accessCookieOptions
    )
    .cookie(
      "refreshToken",
      refreshToken,
      refreshCookieOptions
    )
    .json(
      new ApiResponse(
        200,
        { user: safeUser },
        "Logged in successfully"
      )
    );
});

// LOGOUT USER
const logoutUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  await db.execute(
    `UPDATE users
     SET refresh_token = NULL
     WHERE id = ?`,
    [userId]
  );

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(
      new ApiResponse(
        200,
        {},
        "Logged out successfully"
      )
    );
});

// REFRESH ACCESS TOKEN
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies?.refreshToken ||
    req.body?.refreshToken;

  if (
    typeof incomingRefreshToken !== "string" ||
    !incomingRefreshToken
  ) {
    throw new ApiError(
      401,
      "Refresh token is required"
    );
  }

  let decodedToken;

  try {
    decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );
  } catch {
    throw new ApiError(
      401,
      "Invalid or expired refresh token"
    );
  }

  if (!decodedToken?.id) {
    throw new ApiError(
      401,
      "Invalid refresh token payload"
    );
  }

  const [users] = await db.execute(
    `SELECT id, name, email, phone, refresh_token
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [decodedToken.id]
  );

  if (users.length === 0) {
    throw new ApiError(401, "User not found");
  }

  const user = users[0];

  if (
    !user.refresh_token ||
    user.refresh_token !== incomingRefreshToken
  ) {
    throw new ApiError(
      401,
      "Refresh token is expired, revoked, or already used"
    );
  }

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = generateRefreshToken(user);

  // Rotate the refresh token in the database.
  await db.execute(
    `UPDATE users
     SET refresh_token = ?
     WHERE id = ?`,
    [newRefreshToken, user.id]
  );

  return res
    .status(200)
    .cookie(
      "accessToken",
      newAccessToken,
      accessCookieOptions
    )
    .cookie(
      "refreshToken",
      newRefreshToken,
      refreshCookieOptions
    )
    .json(
      new ApiResponse(
        200,
        {},
        "Access token refreshed successfully"
      )
    );
});

// GET CURRENT USER
const getCurrentUser = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  const [users] = await db.execute(
    `SELECT id, name, email, phone, created_at
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (users.length === 0) {
    throw new ApiError(404, "User not found");
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      users[0],
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
