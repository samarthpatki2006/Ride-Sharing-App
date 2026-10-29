import {
  getCurrentUser,
  refreshAccessToken,
  logoutUser,
} from "../api/auth.api.js";

export const $ = (id) => document.getElementById(id);

export function pageURL(name) {
  return new URL(`../pages/${name}.html`, import.meta.url).href;
}

// Safely display text returned by the API.
export function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function showMessage(text = "", type = "error", id = "message") {
  const box = $(id);

  if (!box) return;

  box.textContent = text;
  box.className = `message ${type}`;
  box.hidden = !text;
}

export function getErrorMessage(error) {
  return (
    error.response?.data?.message ||
    "Could not connect to the server. Please try again."
  );
}

export function handleError(error, id = "message") {
  if (error.response?.status === 401) {
    window.location.href = pageURL("login");
    return;
  }

  showMessage(getErrorMessage(error), "error", id);
}

export function setBusy(button, busy) {
  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = "Please wait...";
  } else {
    button.textContent =
      button.dataset.originalText || button.textContent;
  }

  button.disabled = busy;
}

export function emptyState(text) {
  return `<div class="empty">${escapeHTML(text)}</div>`;
}

export function formatDate(value) {
  if (!value) return "Not provided";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return "Not provided";

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatCost(value) {
  if (value === null || value === undefined || value === "") {
    return "Not specified";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function statusBadge(status = "") {
  const statuses = [
    "open",
    "full",
    "pending",
    "approved",
    "rejected",
    "cancelled",
    "completed",
    "in_progress",
  ];

  const className = statuses.includes(status) ? status : "";

  return `
    <span class="badge ${className}">
      ${escapeHTML(status.replaceAll("_", " "))}
    </span>
  `;
}

export function rememberMessage(text) {
  sessionStorage.setItem("ride-message", text);
}

export function showSavedMessage() {
  const text = sessionStorage.getItem("ride-message");

  if (text) {
    showMessage(text, "success");
    sessionStorage.removeItem("ride-message");
  }
}

/* Navbar */

export function renderNavbar(user = null) {
  const currentPage = document.body.dataset.page;
  const homeURL = new URL("../index.html", import.meta.url).href;

  function navLink(name, label) {
    const active = currentPage === name ? "active" : "";

    return `
      <a class="${active}" href="${pageURL(name)}">
        ${label}
      </a>
    `;
  }

  $("navbar").innerHTML = `
    <nav class="nav-container" aria-label="Main navigation">
      <a class="logo" href="${homeURL}">
        ride<span>together.</span>
      </a>

      <div class="nav-links">
        ${navLink("rides", "Find a ride")}
        ${navLink("my-rides", "My rides")}
        ${navLink("publish", "Publish a ride")}

        ${
          user
            ? `
              ${navLink("profile", "Profile")}
              <button id="logout-button" class="text-button">
                Log out
              </button>
            `
            : `
              ${navLink("login", "Log in")}
              <a class="button small" href="${pageURL("register")}">
                Register
              </a>
            `
        }
      </div>
    </nav>
  `;

  if (user) {
    $("logout-button").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      setBusy(button, true);

      try {
        await logoutUser();
        window.location.href = pageURL("login");
      } catch (error) {
        showMessage(getErrorMessage(error), "error", "global-message");
        setBusy(button, false);
      }
    });
  }
}

/* Authentication for protected pages */

export async function requireUser() {
  renderNavbar();

  try {
    let response;

    try {
      response = await getCurrentUser();
    } catch (error) {
      if (error.response?.status !== 401) throw error;

      await refreshAccessToken();
      response = await getCurrentUser();
    }

    const user = Array.isArray(response.data)
      ? response.data[0]
      : response.data;

    if (!user?.id) {
      window.location.href = pageURL("login");
      return null;
    }

    renderNavbar(user);
    $("protected-content").hidden = false;

    return user;
  } catch (error) {
    handleError(error, "global-message");
    return null;
  }
}

/* Shared ride card */

export function rideCard(ride, mode) {
  const tripId = ride.trip_id ?? ride.id;

  const peopleURL =
    `${pageURL("people")}?tripId=${encodeURIComponent(tripId)}`;

  const status =
    mode === "booking" ? ride.booking_status : ride.status;

  let action = "";

  if (mode === "available") {
    action = `
      <form class="join-form" data-trip-id="${escapeHTML(tripId)}">
        <label>
          Seats
          <input
            name="seats"
            type="number"
            min="1"
            max="${Number(ride.available_seats)}"
            step="1"
            value="1"
            required
          >
        </label>

        <button class="button" type="submit">Join now</button>
      </form>
    `;
  }

  if (mode === "published") {
    const pending = Number(ride.pending_requests || 0);

    action = `
      <a href="${peopleURL}" class="button secondary small">
        People & requests (${pending})
      </a>
    `;
  }

  if (mode === "booking") {
    if (ride.booking_status === "approved") {
      action = `
        <a href="${peopleURL}" class="button secondary small">
          View people
        </a>
      `;
    } else if (ride.booking_status === "pending") {
      action = `
        <span class="form-note">
          Waiting for publisher approval
        </span>
      `;
    } else {
      action = `
        <span class="form-note">
          Request ${escapeHTML(ride.booking_status)}
        </span>
      `;
    }
  }

  return `
    <article class="ride-card">
      <div class="card-top">
        <span class="eyebrow">
          ${ride.ride_type === "cab_share" ? "CAB SHARE" : "SELF DRIVEN"}
        </span>

        ${statusBadge(status)}
      </div>

      <h3 class="ride-route">
        ${escapeHTML(ride.source)}
        <span>→</span>
        ${escapeHTML(ride.destination)}
      </h3>

      <p class="ride-meta">
        ${escapeHTML(formatDate(ride.departure_time))}
      </p>

      <p class="ride-meta">
        ${Number(ride.available_seats)} seats available
        · Published by ${escapeHTML(ride.publisher_name || "you")}
      </p>

      ${
        mode === "booking"
          ? `
            <p class="ride-meta">
              ${Number(ride.seats_requested)} seat(s) requested
              · Ride: ${escapeHTML(ride.ride_status)}
            </p>
          `
          : ""
      }

      ${
        ride.notes
          ? `<p class="ride-notes">${escapeHTML(ride.notes)}</p>`
          : ""
      }

      <div class="card-bottom">
        <div class="price">
          ${escapeHTML(formatCost(ride.cost_per_person))}
          <small>per person</small>
        </div>

        ${action}
      </div>
    </article>
  `;
}