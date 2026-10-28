import {Router} from "express";
import { registerUser,loginUser,logoutUser,getCurrentUser,refreshAccessToken } from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router=Router();
router.route("/register-user").post(registerUser);
router.route("/login-user").post(loginUser);
router.route("/logout-user").post(verifyJWT,logoutUser);
router.route("/get-current-user").get(verifyJWT,getCurrentUser);
router.route("/refresh-access-token").post(verifyJWT,refreshAccessToken);
export default router;