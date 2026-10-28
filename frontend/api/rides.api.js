import api from "./axios.js";

const ridesPath = "/rides";

// rideData: { ride_type, source, destination, departure_time,
//             total_seats, estimated_total_cost, cost_per_person, notes }
export const publishRide = async (rideData) => {
  const response = await api.post(ridesPath, rideData);
  return response.data;
};

export const bookRide = async (tripId, seatsRequested = 1) => {
  const response = await api.post(`${ridesPath}/${tripId}/book`, {
    seats_requested: seatsRequested,
  });
  return response.data;
};

export const approveRideBooking = async (tripId, bookingId) => {
  const response = await api.patch(
    `${ridesPath}/${tripId}/bookings/${bookingId}/approve`
  );
  return response.data;
};

export const getMyRides = async () => {
  const response = await api.get(`${ridesPath}/my`);
  return response.data;
};

export const getRidePeople = async (tripId) => {
  const response = await api.get(`${ridesPath}/${tripId}/people`);
  return response.data;
};