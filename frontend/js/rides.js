import {
  getAvailableRides,
  bookRide,
} from "../api/rides.api.js";

import {
  $,
  requireUser,
  rideCard,
  emptyState,
  showMessage,
  setBusy,
  handleError,
} from "./common.js";

let rides = [];

const list = $("rides-list");
const searchForm = $("search-form");

function renderRides() {
  const source =
    searchForm.elements.source.value.trim().toLowerCase();

  const destination =
    searchForm.elements.destination.value.trim().toLowerCase();

  const filtered = rides.filter((ride) => {
    return (
      ride.source.toLowerCase().includes(source) &&
      ride.destination.toLowerCase().includes(destination)
    );
  });

  $("ride-count").textContent = `(${filtered.length})`;

  list.innerHTML = filtered.length
    ? filtered.map((ride) => rideCard(ride, "available")).join("")
    : emptyState("No available rides match your search.");
}

async function loadRides() {
  const button = $("refresh-rides");
  setBusy(button, true);

  list.innerHTML = emptyState("Loading available rides...");

  try {
    const response = await getAvailableRides();
    rides = response.data || [];

    renderRides();
  } catch (error) {
    list.innerHTML = emptyState(
      "Could not load rides. Click Refresh to retry."
    );

    handleError(error);
  } finally {
    setBusy(button, false);
  }
}

const user = await requireUser();

if (user) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    renderRides();
  });

  searchForm.addEventListener("reset", () => {
    // Render after the browser has cleared the inputs.
    setTimeout(renderRides, 0);
  });

  $("refresh-rides").addEventListener("click", () => {
    showMessage();
    loadRides();
  });

  list.addEventListener("submit", async (event) => {
    const form = event.target.closest(".join-form");

    if (!form) return;

    event.preventDefault();
    showMessage();

    const tripId = form.dataset.tripId;
    const seats = Number(form.elements.seats.value);
    const button = form.querySelector("button");

    setBusy(button, true);

    try {
      await bookRide(tripId, seats);

      rides = rides.filter((ride) => String(ride.id) !== tripId);
      renderRides();

      showMessage(
        "Request sent! Check My rides for the publisher's approval.",
        "success"
      );
    } catch (error) {
      handleError(error);
      setBusy(button, false);
    }
  });

  loadRides();
}