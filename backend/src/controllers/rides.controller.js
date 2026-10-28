
import { db } from "../database/index.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// PUBLISH A RIDE
const publishRide = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  const {
    ride_type,
    source,
    destination,
    departure_time,
    total_seats,
    estimated_total_cost,
    cost_per_person,
    notes,
  } = req.body;

  if (
    !["self_driven", "cab_share"].includes(ride_type) ||
    typeof source !== "string" ||
    !source.trim() ||
    typeof destination !== "string" ||
    !destination.trim() ||
    !departure_time
  ) {
    throw new ApiError(
      400,
      "Ride type, source, destination, and departure time are required"
    );
  }

  const seats = Number(total_seats);

  if (!Number.isInteger(seats) || seats < 1 || seats > 255) {
    throw new ApiError(
      400,
      "Total seats must be an integer between 1 and 255"
    );
  }

  const departureDate = new Date(departure_time);

  if (Number.isNaN(departureDate.getTime())) {
    throw new ApiError(400, "Invalid departure time");
  }

  if (departureDate.getTime() <= Date.now()) {
    throw new ApiError(
      400,
      "Departure time must be in the future"
    );
  }

  const validateCost = (value, fieldName) => {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
      throw new ApiError(
        400,
        `${fieldName} must be a non-negative number`
      );
    }

    return amount;
  };

  const totalCost = validateCost(
    estimated_total_cost,
    "Estimated total cost"
  );

  const personCost = validateCost(
    cost_per_person,
    "Cost per person"
  );

  if (
    notes !== undefined &&
    notes !== null &&
    typeof notes !== "string"
  ) {
    throw new ApiError(400, "Notes must be a string");
  }

  const [result] = await db.execute(
    `INSERT INTO trips (
      publisher_id,
      ride_type,
      source,
      destination,
      departure_time,
      total_seats,
      available_seats,
      estimated_total_cost,
      cost_per_person,
      notes,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
    [
      userId,
      ride_type,
      source.trim(),
      destination.trim(),
      departureDate,
      seats,
      seats,
      totalCost,
      personCost,
      notes?.trim() || null,
    ]
  );

  const [rides] = await db.execute(
    `SELECT
      t.*,
      u.name AS publisher_name
    FROM trips t
    JOIN users u ON u.id = t.publisher_id
    WHERE t.id = ?`,
    [result.insertId]
  );

  return res.status(201).json(
    new ApiResponse(
      201,
      rides[0],
      "Ride published successfully"
    )
  );
});

// BOOK A RIDE
const bookRide = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const tripId = Number(req.params.tripId);

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  if (!Number.isSafeInteger(tripId) || tripId <= 0) {
    throw new ApiError(400, "Invalid ride ID");
  }

  const requestedSeats =
    req.body.seats_requested === undefined
      ? 1
      : Number(req.body.seats_requested);

  if (
    !Number.isInteger(requestedSeats) ||
    requestedSeats < 1 ||
    requestedSeats > 255
  ) {
    throw new ApiError(
      400,
      "Requested seats must be a positive integer"
    );
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [rides] = await connection.execute(
      `SELECT id, publisher_id, available_seats, status, departure_time
       FROM trips
       WHERE id = ?
       FOR UPDATE`,
      [tripId]
    );

    if (rides.length === 0) {
      throw new ApiError(404, "Ride not found");
    }

    const ride = rides[0];

    if (String(ride.publisher_id) === String(userId)) {
      throw new ApiError(
        400,
        "You cannot book your own ride"
      );
    }

    if (ride.status !== "open") {
      throw new ApiError(
        400,
        "This ride is not accepting booking requests"
      );
    }

    if (new Date(ride.departure_time).getTime() <= Date.now()) {
      throw new ApiError(
        400,
        "You cannot book a ride that has already departed"
      );
    }

    if (Number(ride.available_seats) < requestedSeats) {
      throw new ApiError(
        400,
        "Not enough seats are available"
      );
    }

    const [existingBookings] = await connection.execute(
      `SELECT id, status
       FROM trip_bookings
       WHERE trip_id = ? AND passenger_id = ?
       FOR UPDATE`,
      [tripId, userId]
    );

    let bookingId;

    if (existingBookings.length > 0) {
      const existingBooking = existingBookings[0];

      if (
        existingBooking.status === "pending" ||
        existingBooking.status === "approved"
      ) {
        throw new ApiError(
          409,
          "You already have an active booking for this ride"
        );
      }

      // Reuse the existing row because the schema has
      // UNIQUE (trip_id, passenger_id).
      await connection.execute(
        `UPDATE trip_bookings
         SET seats_requested = ?,
             status = 'pending',
             requested_at = CURRENT_TIMESTAMP,
             reviewed_at = NULL
         WHERE id = ?`,
        [requestedSeats, existingBooking.id]
      );

      bookingId = existingBooking.id;
    } else {
      const [result] = await connection.execute(
        `INSERT INTO trip_bookings (
          trip_id,
          passenger_id,
          seats_requested,
          status
        )
        VALUES (?, ?, ?, 'pending')`,
        [tripId, userId, requestedSeats]
      );

      bookingId = result.insertId;
    }

    await connection.commit();

    const [bookings] = await db.execute(
      `SELECT
        b.id,
        b.trip_id,
        b.passenger_id,
        b.seats_requested,
        b.status,
        b.requested_at,
        b.reviewed_at,
        t.source,
        t.destination,
        t.departure_time,
        u.name AS publisher_name
      FROM trip_bookings b
      JOIN trips t ON t.id = b.trip_id
      JOIN users u ON u.id = t.publisher_id
      WHERE b.id = ?`,
      [bookingId]
    );

    return res.status(201).json(
      new ApiResponse(
        201,
        bookings[0],
        "Ride booking request submitted successfully"
      )
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// APPROVE A PASSENGER'S BOOKING
const approveRideBooking = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const tripId = Number(req.params.tripId);
  const bookingId = Number(req.params.bookingId);

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  if (
    !Number.isSafeInteger(tripId) ||
    tripId <= 0 ||
    !Number.isSafeInteger(bookingId) ||
    bookingId <= 0
  ) {
    throw new ApiError(400, "Invalid ride or booking ID");
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Lock the ride first. All booking approvals for this ride
    // serialize on this row, preventing seat overbooking.
    const [rides] = await connection.execute(
      `SELECT id, publisher_id, available_seats, status
       FROM trips
       WHERE id = ?
       FOR UPDATE`,
      [tripId]
    );

    if (rides.length === 0) {
      throw new ApiError(404, "Ride not found");
    }

    const ride = rides[0];

    if (String(ride.publisher_id) !== String(userId)) {
      throw new ApiError(
        403,
        "Only the ride publisher can approve booking requests"
      );
    }

    if (!["open", "full"].includes(ride.status)) {
      throw new ApiError(
        400,
        "Bookings cannot be approved for this ride"
      );
    }

    const [bookings] = await connection.execute(
      `SELECT id, passenger_id, seats_requested, status
       FROM trip_bookings
       WHERE id = ? AND trip_id = ?
       FOR UPDATE`,
      [bookingId, tripId]
    );

    if (bookings.length === 0) {
      throw new ApiError(404, "Booking request not found");
    }

    const booking = bookings[0];

    if (booking.status !== "pending") {
      throw new ApiError(
        409,
        "This booking request has already been reviewed or cancelled"
      );
    }

    const seatsRequested = Number(booking.seats_requested);
    const seatsAvailable = Number(ride.available_seats);

    if (seatsAvailable < seatsRequested) {
      throw new ApiError(
        400,
        "Not enough available seats to approve this request"
      );
    }

    const remainingSeats = seatsAvailable - seatsRequested;

    await connection.execute(
      `UPDATE trip_bookings
       SET status = 'approved',
           reviewed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [bookingId]
    );

    await connection.execute(
      `UPDATE trips
       SET available_seats = ?,
           status = ?
       WHERE id = ?`,
      [
        remainingSeats,
        remainingSeats === 0 ? "full" : "open",
        tripId,
      ]
    );

    await connection.commit();

    const [updatedBookings] = await db.execute(
      `SELECT
        b.id,
        b.trip_id,
        b.passenger_id,
        b.seats_requested,
        b.status,
        b.requested_at,
        b.reviewed_at,
        u.name AS passenger_name,
        u.email AS passenger_email,
        u.phone AS passenger_phone
      FROM trip_bookings b
      JOIN users u ON u.id = b.passenger_id
      WHERE b.id = ?`,
      [bookingId]
    );

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          booking: updatedBookings[0],
          available_seats: remainingSeats,
          ride_status: remainingSeats === 0 ? "full" : "open",
        },
        "Passenger approved successfully"
      )
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

// GET ALL MY RIDES
// Returns rides I published and rides I requested/booked.
const getMyRides = asyncHandler(async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  const [publishedRides] = await db.execute(
    `SELECT
      t.*,
      u.name AS publisher_name,
      (
        SELECT COUNT(*)
        FROM trip_bookings b
        WHERE b.trip_id = t.id
          AND b.status = 'pending'
      ) AS pending_requests
    FROM trips t
    JOIN users u ON u.id = t.publisher_id
    WHERE t.publisher_id = ?
    ORDER BY t.departure_time DESC`,
    [userId]
  );

  const [myBookings] = await db.execute(
    `SELECT
      b.id AS booking_id,
      b.trip_id,
      b.passenger_id,
      b.seats_requested,
      b.status AS booking_status,
      b.requested_at,
      b.reviewed_at,
      t.ride_type,
      t.source,
      t.destination,
      t.departure_time,
      t.total_seats,
      t.available_seats,
      t.estimated_total_cost,
      t.cost_per_person,
      t.status AS ride_status,
      t.publisher_id,
      u.name AS publisher_name,
      u.email AS publisher_email,
      u.phone AS publisher_phone
    FROM trip_bookings b
    JOIN trips t ON t.id = b.trip_id
    JOIN users u ON u.id = t.publisher_id
    WHERE b.passenger_id = ?
    ORDER BY b.requested_at DESC`,
    [userId]
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        publishedRides,
        myBookings,
      },
      "Your rides fetched successfully"
    )
  );
});

const getRidePeople = asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const tripId = Number(req.params.tripId);

  if (!userId) {
    throw new ApiError(401, "Unauthorized request");
  }

  if (!Number.isSafeInteger(tripId) || tripId <= 0) {
    throw new ApiError(400, "Invalid ride ID");
  }

  const [rides] = await db.execute(
    `SELECT
       t.id,
       t.publisher_id,
       t.ride_type,
       t.source,
       t.destination,
       t.departure_time,
       t.status,
       u.name AS publisher_name,
       u.email AS publisher_email,
       u.phone AS publisher_phone
     FROM trips t
     JOIN users u ON u.id = t.publisher_id
     WHERE t.id = ?`,
    [tripId]
  );

  if (rides.length === 0) {
    throw new ApiError(404, "Ride not found");
  }

  const ride = rides[0];

  // Only the publisher and approved passengers can view
  // the people participating in this ride.
  const [access] = await db.execute(
    `SELECT id
     FROM trip_bookings
     WHERE trip_id = ?
       AND passenger_id = ?
       AND status = 'approved'
     LIMIT 1`,
    [tripId, userId]
  );

  if (
    String(ride.publisher_id) !== String(userId) &&
    access.length === 0
  ) {
    throw new ApiError(
      403,
      "Only the publisher and approved passengers can view ride participants"
    );
  }

  const [passengers] = await db.execute(
    `SELECT
       u.id AS user_id,
       u.name,
       u.email,
       u.phone,
       b.id AS booking_id,
       b.seats_requested,
       b.status AS booking_status,
       b.requested_at,
       b.reviewed_at
     FROM trip_bookings b
     JOIN users u ON u.id = b.passenger_id
     WHERE b.trip_id = ?
       AND b.status = 'approved'
     ORDER BY b.reviewed_at ASC`,
    [tripId]
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ride,
        publisher: {
          id: ride.publisher_id,
          name: ride.publisher_name,
          email: ride.publisher_email,
          phone: ride.publisher_phone,
        },
        passengers,
      },
      "Ride participants fetched successfully"
    )
  );
});

export {
  publishRide,
  bookRide,
  approveRideBooking,
  getMyRides,
  getRidePeople,
};