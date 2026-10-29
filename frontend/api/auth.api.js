import api from "./axios.js";

export const registerUser = async (userData) => {
  const response = await api.post("/users/register", userData);
  return response.data;
};

export const loginUser = async (credentials) => {
  const response = await api.post("/users/login", credentials);
  return response.data;
};

export const logoutUser = async () => {
  const response = await api.post("/users/logout");
  return response.data;
};

export const getCurrentUser = async () => {
  const response = await api.get("/users/get-current-user");
  return response.data;
};

export const refreshAccessToken = async () => {
  const response = await api.post("/users/refresh-access-token");
  return response.data;
};