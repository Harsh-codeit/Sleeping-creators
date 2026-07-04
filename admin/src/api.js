import axios from "axios";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8001";

const api = axios.create({ baseURL: BASE });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem("sc_admin_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401 || err.response?.status === 403) {
      localStorage.removeItem("sc_admin_token");
      window.location.href = "/";
    }
    return Promise.reject(err);
  }
);

export default api;
