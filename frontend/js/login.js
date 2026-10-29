import { loginUser } from "../api/auth.api.js";

import {
  $,
  renderNavbar,
  showMessage,
  showSavedMessage,
  getErrorMessage,
  setBusy,
  pageURL,
} from "./common.js";

renderNavbar();
showSavedMessage();

const form = $("login-form");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage();

  const button = form.querySelector('button[type="submit"]');
  setBusy(button, true);

  try {
    console.log("Login started");

    const response = await loginUser({
      email: form.elements.email.value.trim(),
      password: form.elements.password.value,
    });

    console.log("Login successful:", response);
    console.log("Redirect URL:", pageURL("rides"));

    window.location.href = pageURL("rides");
  } catch (error) {
    console.error("Login failed:", error);
    console.error("Response data:", error.response?.data);
    console.error("Status:", error.response?.status);

    showMessage(getErrorMessage(error));
    setBusy(button, false);
  }
});