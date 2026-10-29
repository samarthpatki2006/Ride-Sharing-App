import { publishRide } from "../api/rides.api.js";

import {
  $,
  requireUser,
  showMessage,
  setBusy,
  handleError,
  rememberMessage,
  pageURL,
} from "./common.js";

const user = await requireUser();

if (user) {
  const form = $("publish-form");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage();

    const values = Object.fromEntries(new FormData(form));
    const departure = new Date(values.departure_time);

    if (
      Number.isNaN(departure.getTime()) ||
      departure.getTime() <= Date.now()
    ) {
      showMessage("Please choose a valid future departure time.");
      return;
    }

    if (!values.source.trim() || !values.destination.trim()) {
      showMessage("Please enter the source and destination.");
      return;
    }

    const rideData = {
      ride_type: values.ride_type,
      source: values.source.trim(),
      destination: values.destination.trim(),
      departure_time: departure.toISOString(),
      total_seats: Number(values.total_seats),

      estimated_total_cost:
        values.estimated_total_cost === ""
          ? null
          : Number(values.estimated_total_cost),

      cost_per_person:
        values.cost_per_person === ""
          ? null
          : Number(values.cost_per_person),

      notes: values.notes.trim() || null,
    };

    const button = form.querySelector("button[type=submit]");
    setBusy(button, true);

    try {
      await publishRide(rideData);

      rememberMessage(
        "Ride published! Open People & requests to review passenger requests."
      );

      window.location.href = pageURL("my-rides");
    } catch (error) {
      handleError(error);
      setBusy(button, false);
    }
  });
}