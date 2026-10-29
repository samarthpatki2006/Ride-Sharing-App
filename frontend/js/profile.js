import {
  $,
  requireUser,
  formatDate,
} from "./common.js";

const user = await requireUser();

if (user) {
  $("profile-avatar").textContent =
    (user.name || "U")[0].toUpperCase();

  $("profile-name").textContent = user.name || "Your profile";

  $("detail-name").textContent = user.name || "Not provided";
  $("detail-email").textContent = user.email || "Not provided";
  $("detail-phone").textContent = user.phone || "Not provided";
  $("detail-created").textContent = formatDate(user.created_at);
}