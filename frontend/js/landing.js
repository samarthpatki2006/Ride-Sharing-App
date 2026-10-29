import { getCurrentUser } from "../api/auth.api.js";
import { renderNavbar } from "./common.js";

renderNavbar();

try {
  const response = await getCurrentUser();

  const user = Array.isArray(response.data)
    ? response.data[0]
    : response.data;

  if (user?.id) {
    renderNavbar(user);
  }
} catch {
  // Visitors can use the landing page without logging in.
}