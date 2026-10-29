const api = window.axios.create({
  baseURL: "http://127.0.0.1:8000/api/v1",
  withCredentials: true,
  timeout: 10000,
});

export default api;