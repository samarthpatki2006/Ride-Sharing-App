import { Router } from "express";
import {publishRide,bookRide,approveRideBooking,getMyRides,getRidePeople,getAvailableRides} from "../controllers/rides.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(verifyJWT);
router.post("/", publishRide);
router.post("/:tripId/book", bookRide);
router.patch("/:tripId/bookings/:bookingId/approve", approveRideBooking);
router.get("/my", getMyRides);
router.get("/:tripId/people", getRidePeople);
router.get("/get-available-rides", getAvailableRides);

export default router;
