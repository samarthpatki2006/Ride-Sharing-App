import { db } from "../database/index.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const currentUser = (req) => {
  const user = Array.isArray(req.user) ? req.user[0] : req.user;
  if (!user?.id) throw new ApiError(401, "Please log in first");
  return String(user.id);
};

const seatCount = (value) => {
  const seats = Number(value);
  if (!Number.isInteger(seats) || seats < 1 || seats > 255) {
    throw new ApiError(400, "Seats must be between 1 and 255");
  }
  return seats;
};

const costValue = (value) => {
  if (value == null || value === "") return null;
  const cost = Number(value);
  if (!Number.isFinite(cost) || cost < 0) {
    throw new ApiError(400, "Cost must be a positive number or zero");
  }
  return cost;
};

const ensureUpcoming = (ride) => {
  if (new Date(ride.departure_time).getTime() <= Date.now()) {
    throw new ApiError(400, "This ride has already departed");
  }
};

// Keep booking changes together and always release the connection.
const inTransaction = async (work) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const lockRide = async (connection, tripId) => {
  const [rides] = await connection.execute(
    `SELECT id, publisher_id, available_seats, status, departure_time
     FROM trips WHERE id = ? FOR UPDATE`, [tripId]
  );
  if (!rides.length) throw new ApiError(404, "Ride not found");
  return rides[0];
};

const publishRide = asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const body = req.body ?? {};
  if (!["self_driven", "cab_share"].includes(body.ride_type)) {
    throw new ApiError(400, "Invalid ride type");
  }
  const { source, destination, departure_time } = body;
  if (typeof source !== "string" || !source.trim() ||
      typeof destination !== "string" || !destination.trim() || !departure_time) {
    throw new ApiError(400, "Source, destination and departure time are required");
  }
  const departure = new Date(departure_time);
  if (Number.isNaN(departure.getTime()) || departure.getTime() <= Date.now()) {
    throw new ApiError(400, "Enter a valid future departure time");
  }
  const seats = seatCount(body.total_seats);
  const totalCost = costValue(body.estimated_total_cost);
  const personCost = costValue(body.cost_per_person);

  const ride = await inTransaction(async (connection) => {
    const [result] = await connection.execute(
      `INSERT INTO trips (publisher_id, ride_type, source, destination,
       departure_time, total_seats, available_seats, estimated_total_cost,
       cost_per_person, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [userId, body.ride_type, source.trim(), destination.trim(), departure, seats, seats, totalCost, personCost, body.notes || null]
    );
    const [rides] = await connection.execute(
      `SELECT t.*, u.name AS publisher_name FROM trips t
       JOIN users u ON u.id = t.publisher_id WHERE t.id = ?`, [result.insertId]
    );
    if (!rides.length) throw new ApiError(500, "Unable to read the published ride");
    return rides[0];
  });
  return res.status(201).json(new ApiResponse(201, ride, "Ride published successfully"));
});

const bookRide = asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const { tripId } = req.params;
  const seats = seatCount(req.body?.seats_requested === undefined ? 1 : req.body.seats_requested);
  const booking = await inTransaction(async (connection) => {
    const ride = await lockRide(connection, tripId);
    if (String(ride.publisher_id) === userId) throw new ApiError(400, "You cannot book your own ride");
    if (ride.status !== "open") throw new ApiError(400, "This ride is not accepting booking requests");
    ensureUpcoming(ride);
    if (Number(ride.available_seats) < seats) throw new ApiError(400, "Not enough seats are available");

    const [existing] = await connection.execute(
      `SELECT id, status FROM trip_bookings
       WHERE trip_id = ? AND passenger_id = ? FOR UPDATE`, [tripId, userId]
    );
    let bookingId;
    if (existing.length) {
      if (!["cancelled", "rejected"].includes(existing[0].status)) {
        throw new ApiError(409, "You already have an active booking for this ride");
      }
      bookingId = existing[0].id;
      await connection.execute(
        `UPDATE trip_bookings SET seats_requested = ?, status = 'pending',
         requested_at = CURRENT_TIMESTAMP, reviewed_at = NULL WHERE id = ?`, [seats, bookingId]
      );
    } else {
      const [result] = await connection.execute(
        `INSERT INTO trip_bookings (trip_id, passenger_id, seats_requested, status)
         VALUES (?, ?, ?, 'pending')`, [tripId, userId, seats]
      );
      bookingId = result.insertId;
    }
    // Pending requests do not reserve seats.
    const [bookings] = await connection.execute(
      `SELECT b.id, b.trip_id, b.passenger_id, b.seats_requested, b.status,
       b.requested_at, b.reviewed_at, t.source, t.destination, t.departure_time,
       u.name AS publisher_name FROM trip_bookings b
       JOIN trips t ON t.id = b.trip_id JOIN users u ON u.id = t.publisher_id
       WHERE b.id = ?`, [bookingId]
    );
    if (!bookings.length) throw new ApiError(500, "Unable to read the booking request");
    return bookings[0];
  });
  return res.status(201).json(new ApiResponse(201, booking, "Ride booking request submitted successfully"));
});

const approveRideBooking = asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const { tripId } = req.params;
  const { bookingId } = req.params;
  const result = await inTransaction(async (connection) => {
    // Lock the ride so two approvals cannot use the same available seats.
    const ride = await lockRide(connection, tripId);
    if (String(ride.publisher_id) !== userId) {
      throw new ApiError(403, "Only the ride publisher can approve booking requests");
    }
    if (!["open", "full"].includes(ride.status)) throw new ApiError(400, "Bookings cannot be approved for this ride");
    ensureUpcoming(ride);
    const [bookings] = await connection.execute(
      `SELECT id, passenger_id, seats_requested, status FROM trip_bookings
       WHERE id = ? AND trip_id = ? FOR UPDATE`, [bookingId, tripId]
    );
    if (!bookings.length) throw new ApiError(404, "Booking request not found");
    const booking = bookings[0];
    if (booking.status !== "pending") throw new ApiError(409, "This booking request has already been reviewed or cancelled");
    if (String(booking.passenger_id) === userId) throw new ApiError(400, "You cannot approve your own booking");
    const remaining = Number(ride.available_seats) - Number(booking.seats_requested);
    if (remaining < 0) throw new ApiError(400, "Not enough available seats to approve this request");
    const status = remaining === 0 ? "full" : "open";
    await connection.execute(
      `UPDATE trip_bookings SET status = 'approved', reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`, [bookingId]
    );
    await connection.execute(
      `UPDATE trips SET available_seats = ?, status = ? WHERE id = ?`, [remaining, status, tripId]
    );
    const [updated] = await connection.execute(
      `SELECT b.id, b.trip_id, b.passenger_id, b.seats_requested, b.status,
       b.requested_at, b.reviewed_at, u.name AS passenger_name,
       u.email AS passenger_email, u.phone AS passenger_phone FROM trip_bookings b
       JOIN users u ON u.id = b.passenger_id WHERE b.id = ?`, [bookingId]
    );
    if (!updated.length) throw new ApiError(500, "Unable to read the approved booking");
    return { booking: updated[0], available_seats: remaining, ride_status: status };
  });
  return res.status(200).json(new ApiResponse(200, result, "Passenger approved successfully"));
});

const getMyRides = asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const [publishedRides] = await db.execute(
    `SELECT t.*, u.name AS publisher_name,
     (SELECT COUNT(*) FROM trip_bookings b WHERE b.trip_id = t.id AND b.status = 'pending') AS pending_requests
     FROM trips t JOIN users u ON u.id = t.publisher_id
     WHERE t.publisher_id = ? ORDER BY t.departure_time DESC`, [userId]
  );
  const [myBookings] = await db.execute(
    `SELECT b.id AS booking_id, b.trip_id, b.passenger_id, b.seats_requested,
     b.status AS booking_status, b.requested_at, b.reviewed_at,
     t.ride_type, t.source, t.destination, t.departure_time, t.total_seats,
     t.available_seats, t.estimated_total_cost, t.cost_per_person,
     t.status AS ride_status, t.publisher_id, u.name AS publisher_name,
     u.email AS publisher_email, u.phone AS publisher_phone
     FROM trip_bookings b JOIN trips t ON t.id = b.trip_id
     JOIN users u ON u.id = t.publisher_id
     WHERE b.passenger_id = ? ORDER BY b.requested_at DESC`, [userId]
  );
  return res.status(200).json(new ApiResponse(200, { publishedRides, myBookings }, "Your rides fetched successfully"));
});

const getRidePeople = asyncHandler(async (req, res) => {
  const userId = currentUser(req);
  const { tripId } = req.params;
  const [rides] = await db.execute(
    `SELECT t.id, t.publisher_id, t.ride_type, t.source, t.destination,
     t.departure_time, t.status, u.name AS publisher_name,
     u.email AS publisher_email, u.phone AS publisher_phone
     FROM trips t JOIN users u ON u.id = t.publisher_id WHERE t.id = ?`, [tripId]
  );
  if (!rides.length) throw new ApiError(404, "Ride not found");
  const ride = rides[0];
  const isPublisher = String(ride.publisher_id) === userId;
  if (!isPublisher) {
    const [access] = await db.execute(
      `SELECT id FROM trip_bookings WHERE trip_id = ? AND passenger_id = ?
       AND status = 'approved' LIMIT 1`, [tripId, userId]
    );
    if (!access.length) throw new ApiError(403, "Only the publisher and approved passengers can view ride participants");
  }
  const [passengers] = await db.execute(
    `SELECT u.id AS user_id, u.name, u.email, u.phone, b.id AS booking_id,
     b.seats_requested, b.status AS booking_status, b.requested_at, b.reviewed_at
     FROM trip_bookings b JOIN users u ON u.id = b.passenger_id
     WHERE b.trip_id = ?
     AND (b.status = 'approved' OR (? = 1 AND b.status = 'pending'))
     ORDER BY b.requested_at ASC`, [tripId, isPublisher ? 1 : 0]
  );
  return res.status(200).json(new ApiResponse(200, {
    ride,
    publisher: { id: ride.publisher_id, name: ride.publisher_name, email: ride.publisher_email, phone: ride.publisher_phone },
    passengers: passengers.filter(person => person.booking_status === 'approved'),
    pendingRequests: isPublisher ? passengers.filter(person => person.booking_status === 'pending') : [],
  }, "Ride participants fetched successfully"));
});
const getAvailableRides = asyncHandler(async (req, res) => {
  const user = Array.isArray(req.user) ? req.user[0] : req.user;

  if (!user?.id) {
    throw new ApiError(401, "Please log in first");
  }

  const [rides] = await db.execute(
    `SELECT
       t.*,
       u.name AS publisher_name
     FROM trips t
     JOIN users u ON u.id = t.publisher_id
     WHERE t.status = 'open'
       AND t.available_seats > 0
       AND t.departure_time > NOW()
       AND t.publisher_id != ?
       AND NOT EXISTS (
         SELECT 1
         FROM trip_bookings b
         WHERE b.trip_id = t.id
           AND b.passenger_id = ?
           AND b.status IN ('pending', 'approved')
       )
     ORDER BY t.departure_time ASC`,
    [user.id, user.id]
  );

  return res.status(200).json(
    new ApiResponse(200, rides, "Available rides fetched successfully")
  );
});
export { publishRide, bookRide, approveRideBooking, getMyRides, getRidePeople,getAvailableRides };
