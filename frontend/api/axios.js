const api = window.axios.create({
  baseURL: "http://localhost:8000/api/v1",
  withCredentials: true,
});

export default api;