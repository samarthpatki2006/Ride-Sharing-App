import api from "./axios.js";

export const getAvailableRides = async () => {
  const response = await api.get("/rides/get-available-rides");
  return response.data;
};

export const publishRide = async (rideData) => {
  const response = await api.post("/rides", rideData);
  return response.data;
};

export const bookRide = async (tripId, seatsRequested = 1) => {
  const response = await api.post(`/rides/${tripId}/book`, {
    seats_requested: seatsRequested,
  });

  return response.data;
};

export const approveRideBooking = async (tripId, bookingId) => {
  const response = await api.patch(
    `/rides/${tripId}/bookings/${bookingId}/approve`
  );

  return response.data;
};

export const getMyRides = async () => {
  const response = await api.get("/rides/my");
  return response.data;
};

export const getRidePeople = async (tripId) => {
  const response = await api.get(`/rides/${tripId}/people`);
  return response.data;
};