import { registerUser } from "../api/auth.api.js";

import {
  $,
  renderNavbar,
  showMessage,
  getErrorMessage,
  setBusy,
  rememberMessage,
  pageURL,
} from "./common.js";

renderNavbar();

const form = $("register-form");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage();

  const values = Object.fromEntries(new FormData(form));

  if (values.password !== values.confirmPassword) {
    showMessage("Passwords do not match.");
    return;
  }

  const button = form.querySelector("button[type=submit]");
  setBusy(button, true);

  try {
    await registerUser({
      name: values.name.trim(),
      email: values.email.trim(),
      phone: values.phone.trim(),
      password: values.password,
    });

    rememberMessage("Account created successfully. Please log in.");
    window.location.href = pageURL("login");
  } catch (error) {
    showMessage(getErrorMessage(error));
    setBusy(button, false);
  }
});