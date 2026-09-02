import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
let explicitLogoutInProgress = false;

export function beginExplicitLogout(): void {
  explicitLogoutInProgress = true;
}

export function finishExplicitLogout(): void {
  // Let the caller finish its SPA navigation before normal 401 handling is
  // enabled again. With no stored token, later anonymous failures are ignored.
  window.setTimeout(() => {
    explicitLogoutInProgress = false;
  }, 0);
}

function isPendingLocationAuthorization(value: unknown): boolean {
  const token = bearerToken(value);
  if (!token) return false;
  const payloadSegment = token.split(".")[1];
  if (!payloadSegment) return false;
  try {
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { purpose?: unknown };
    return payload.purpose === "login_location";
  } catch {
    return false;
  }
}

function bearerToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const token = value.replace(/^Bearer\s+/i, "").trim();
  return token || null;
}

function storedAccessToken(): string | null {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

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
    const token = storedAccessToken();

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
    const usedPendingLocationToken = isPendingLocationAuthorization(
      error.config?.headers?.Authorization,
    );
    const failedRequestToken = bearerToken(error.config?.headers?.Authorization);
    const currentToken = storedAccessToken();
    // A request started with an older token can finish after login/location
    // confirmation has already installed a newer token. Its late 401 must not
    // delete the new session. This is especially visible during local HMR.
    const failedCurrentSession = Boolean(
      currentToken
      && failedRequestToken
      && currentToken === failedRequestToken,
    );
    const isAuthAttempt = requestUrl.includes("/v1/auth/login")
      || requestUrl.includes("/v1/auth/register")
      || requestUrl.includes("/v1/auth/google")
      || requestUrl.includes("/v1/auth/logout")
      || requestUrl.includes("/v1/auth/login/location")
      || requestUrl.includes("/v1/auth/transaction-pin/status");
    if (
      error.response?.status === 401
      && !isAuthAttempt
      && !usedPendingLocationToken
      && !explicitLogoutInProgress
      && failedCurrentSession
    ) {
      localStorage.removeItem("token");
      localStorage.removeItem("auth-storage");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("auth-storage");
      window.location.replace("/login?reason=session-ended");
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
