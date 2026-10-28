import { db } from "../database/index.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { hashPassword, isPasswordCorrect } from "../utils/bcrypt.js";
import { generateAccessAndRefreshTokens } from "../utils/tokens.js";

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  const userDetails = [name, email, password, phone];

  userDetails.forEach((details) => {
    if (!details || details.trim() === "") {
      throw new ApiError(400, "All fields are required");
    }
  });

  const [existingUser] = await db.execute(
    "select * from users where email=? or phone=?",
    [email, phone]
  );

  if (existingUser.length > 0) {
    throw new ApiError(
      400,
      "User with given email or phone no already exists"
    );
  }

  const hashedPassword = await hashPassword(password);

  await db.execute(
    "insert into users (name,email,password_hash,phone) values(?,?,?,?)",
    [name, email, hashedPassword, phone]
  );

  const [createdUser] = await db.execute(
    "select name,email,phone,created_at from users where email=? and phone=?",
    [email, phone]
  );

  if (createdUser.length === 0) {
    throw new ApiError(401, "Something went wrong while creating user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User Registered Successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, phone, password } = req.body;
  console.log(req.body)
  if (email || phone) {
    if (email.trim() == "" && phone.trim() == "") {
      throw new ApiError(400, "Email or Phone required");
    }

    if (!password || password.trim() === "") {
      throw new ApiError(400, "Invalid password");
    }
  }

  let data;

  if (phone) {
    [data] = await db.execute(
      "select id,email,phone,name,password_hash from users where phone=?",
      [phone]
    );
  } else {
    [data] = await db.execute(
      "select id,email,phone,name,password_hash from users where email=?",
      [email]
    );
  }
  console.log(data)

  if (data.length === 0) {
    throw new ApiError(400, "Invalid request");
  }

  const isPasswordValid = isPasswordCorrect(
    password,
    data[0].password_hash
  );

  if (!isPasswordValid) {
    throw new ApiError(400, "Incorrect Password");
  }

  const { accessToken, refreshToken } =
    await generateAccessAndRefreshTokens(data[0]);

  const [loggedInUser] = await db.execute(
    "select name,email,phone,created_at from users where id=?",
    [data[0].id]
  );
  

  const httpOptions = {
    httpOnly: true,
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, httpOptions)
    .cookie("refreshToken", refreshToken, httpOptions)
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken: accessToken,
          refreshToken: refreshToken,
        },
        "User logged In Successfully"
      )
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  const [loggedOutUser] = await db.execute(
    "select id from users where id=?",
    [req.user[0].id]
  );

  if (loggedOutUser.length == 0) {
    throw new ApiError(404, "User to be logged out not found");
  }

  await db.execute(
    "update users set refresh_token=NULL where id=?",
    [loggedOutUser[0].id]
  );

  const options = {
    httpOnly: true,
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User Logged Out"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incommingRefreshToken =
    req.cookies?.refreshToken || req.body?.refreshToken;

  if (!incommingRefreshToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  try {
    const decodedToken = jwt.verify(
      incommingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const [user] = await db.execute(
      "select id,refresh_token from users where id=?",
      [decodedToken?.userId]
    );

    if (user.length == 0) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incommingRefreshToken !== user[0]?.refresh_token) {
      throw new ApiError(401, "Refresh Token is expired or used");
    }

    const options = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, newrefreshToken } =
      await generateAccessAndRefreshTokens(user[0]);

    return res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", newrefreshToken,options)
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newrefreshToken,
          },
          "Access token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid Token");
  }
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        req.user,
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