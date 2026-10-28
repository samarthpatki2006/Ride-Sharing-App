import api from "./axios.js";

const routes = {
  register: "/users/register",
  login: "/users/login",
  logout: "/users/logout",
  currentUser: "/users/get-current-user",
  refreshToken: "/users/refresh-access-token",
};


export const registerUser = async (userData) => {
  const response = await api.post(routes.register, userData);
  return response.data;
};


export const loginUser = async (credentials) => {
  const response = await api.post(routes.login, credentials);
  return response.data;
};

export const logoutUser = async () => {
  const response = await api.post(routes.logout);
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get(routes.currentUser);
  return response.data;
};

export const refreshAccessToken = async () => {
  const response = await api.post(routes.refreshToken);
  return response.data;
};