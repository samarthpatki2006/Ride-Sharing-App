import { getMyRides } from "../api/rides.api.js";

import {
  $,
  requireUser,
  rideCard,
  emptyState,
  showMessage,
  showSavedMessage,
  setBusy,
  handleError,
} from "./common.js";

async function loadMyRides() {
  const button = $("refresh-my-rides");
  setBusy(button, true);

  $("published-list").innerHTML = emptyState("Loading your rides...");
  $("bookings-list").innerHTML = emptyState("Loading your bookings...");

  try {
    const response = await getMyRides();

    const published = response.data.publishedRides || [];
    const bookings = response.data.myBookings || [];

    $("published-list").innerHTML = published.length
      ? published.map((ride) => rideCard(ride, "published")).join("")
      : emptyState("You haven't published any rides yet.");

    $("bookings-list").innerHTML = bookings.length
      ? bookings.map((ride) => rideCard(ride, "booking")).join("")
      : emptyState("You haven't requested any rides yet.");
  } catch (error) {
    $("published-list").innerHTML =
      emptyState("Could not load your rides.");

    $("bookings-list").innerHTML =
      emptyState("Click Refresh to retry.");

    handleError(error);
  } finally {
    setBusy(button, false);
  }
}

const user = await requireUser();

if (user) {
  $("refresh-my-rides").addEventListener("click", () => {
    showMessage();
    loadMyRides();
  });

  showSavedMessage();
  loadMyRides();
}