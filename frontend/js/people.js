import {
  getRidePeople,
  approveRideBooking,
} from "../api/rides.api.js";

import {
  $,
  requireUser,
  escapeHTML,
  formatDate,
  statusBadge,
  emptyState,
  showMessage,
  setBusy,
  handleError,
} from "./common.js";

const tripId = new URLSearchParams(window.location.search).get("tripId");

function personCard(person, type) {
  const pending = type === "pending";
  const publisher = type === "publisher";

  return `
    <article class="person-card">
      <h3>${escapeHTML(person.name)}</h3>

      ${
        publisher
          ? '<span class="badge">Publisher</span>'
          : statusBadge(pending ? "pending" : "approved")
      }

      <p>${escapeHTML(person.email || "Email not provided")}</p>
      <p>${escapeHTML(person.phone || "Phone not provided")}</p>

      ${
        publisher
          ? ""
          : `
            <p>
              ${Number(person.seats_requested)} seat(s)
              ${pending ? "requested" : "reserved"}
            </p>
          `
      }

      ${
        pending
          ? `
            <button
              class="button full"
              data-booking-id="${escapeHTML(person.booking_id)}"
            >
              Approve request
            </button>
          `
          : ""
      }
    </article>
  `;
}

async function loadPeople(user) {
  const button = $("refresh-people");
  setBusy(button, true);

  $("pending-section").hidden = true;
  $("participants-section").hidden = true;
  $("ride-details").innerHTML = emptyState("Loading ride details...");

  try {
    const response = await getRidePeople(encodeURIComponent(tripId));

    const data = response.data;
    const ride = data.ride;

    const isPublisher =
      String(ride.publisher_id) === String(user.id);

    $("ride-details").innerHTML = `
      <section class="panel">
        <div class="card-top">
          <span class="eyebrow">
            ${ride.ride_type === "cab_share" ? "CAB SHARE" : "SELF DRIVEN"}
          </span>

          ${statusBadge(ride.status)}
        </div>

        <h2 class="ride-route">
          ${escapeHTML(ride.source)}
          →
          ${escapeHTML(ride.destination)}
        </h2>

        <p class="muted">
          Departure: ${escapeHTML(formatDate(ride.departure_time))}
        </p>
      </section>
    `;

    $("participants-section").hidden = false;

    $("people-list").innerHTML =
      personCard(data.publisher, "publisher") +
      (data.passengers || [])
        .map((person) => personCard(person, "approved"))
        .join("");

    if (isPublisher) {
      $("pending-section").hidden = false;

      const requests = data.pendingRequests || [];

      $("pending-list").innerHTML = requests.length
        ? requests
            .map((person) => personCard(person, "pending"))
            .join("")
        : emptyState("No pending requests for this ride.");
    }
  } catch (error) {
    $("ride-details").innerHTML =
      emptyState("Could not load this ride.");

    handleError(error);
  } finally {
    setBusy(button, false);
  }
}

const user = await requireUser();

if (user) {
  if (!tripId) {
    showMessage("Select a ride from My rides to view its participants.");
    $("refresh-people").disabled = true;
  } else {
    $("pending-list").addEventListener("click", async (event) => {
      const button = event.target.closest("[data-booking-id]");

      if (!button) return;

      showMessage();

      const buttons = $("pending-list").querySelectorAll("button");

      buttons.forEach((item) => {
        item.disabled = true;
      });

      setBusy(button, true);

      try {
        await approveRideBooking(
          encodeURIComponent(tripId),
          encodeURIComponent(button.dataset.bookingId)
        );

        showMessage(
          "Passenger approved successfully. Their seats are now reserved.",
          "success"
        );

        await loadPeople(user);
      } catch (error) {
        handleError(error);

        buttons.forEach((item) => {
          item.disabled = false;
        });

        setBusy(button, false);
      }
    });

    $("refresh-people").addEventListener("click", () => {
      showMessage();
      loadPeople(user);
    });

    loadPeople(user);
  }
}