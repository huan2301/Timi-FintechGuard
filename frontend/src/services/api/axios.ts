import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
});

// Request interceptor: gan token vao header
axiosInstance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Session-only logins are kept in sessionStorage; remembered logins use localStorage.
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

// Response interceptor: xu ly 401
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const requestUrl = error.config?.url ?? "";
    const isAuthAttempt = requestUrl.includes("/v1/auth/login")
      || requestUrl.includes("/v1/auth/register")
      || requestUrl.includes("/v1/auth/google")
      || requestUrl.includes("/v1/auth/transaction-pin/status");
    if (error.response?.status === 401 && !isAuthAttempt) {
      const hadStoredSession = Boolean(
        localStorage.getItem("token") || sessionStorage.getItem("token"),
      );
      localStorage.removeItem("token");
      localStorage.removeItem("auth-storage");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("auth-storage");
      // A late 401 from an in-flight request must not override an intentional
      // logout that is already returning the user to Home.
      window.location.replace(hadStoredSession ? "/login" : "/");
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
