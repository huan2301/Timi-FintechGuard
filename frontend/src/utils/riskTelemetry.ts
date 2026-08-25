export interface RiskClientContext {
  device_id?: string;
  geo_latitude?: number;
  geo_longitude?: number;
  geo_accuracy_m?: number;
}

export interface LoginRiskClientContext {
  device_id: string;
  geo_latitude: number;
  geo_longitude: number;
  geo_accuracy_m: number;
}

export class LocationPermissionRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationPermissionRequiredError";
  }
}

const DEVICE_ID_STORAGE_KEY = "timi-risk-device-id-v1";
const LOGIN_LOCATION_CONFIRMED_DEVICE_PREFIX = "timi-login-location-confirmed-device-v1";
// The first request can include the browser permission prompt. Five seconds
// is too short on slower devices and makes the first click fail even after
// the user presses Allow.
const GEOLOCATION_TIMEOUT_MS = 9_000;
const GEOLOCATION_RETRY_DELAY_MS = 300;

function createDeviceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStableDeviceId(): string | undefined {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 16) return existing;
    const created = createDeviceId();
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    // Transactions can proceed without this optional context; login cannot.
    return undefined;
  }
}

async function getCoarseLocation(): Promise<Pick<
  RiskClientContext,
  "geo_latitude" | "geo_longitude" | "geo_accuracy_m"
> | undefined> {
  if (!("geolocation" in navigator)) return undefined;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => resolve({
            geo_latitude: position.coords.latitude,
            geo_longitude: position.coords.longitude,
            geo_accuracy_m: position.coords.accuracy,
          }),
          (error) => reject(error),
          {
            enableHighAccuracy: false,
            maximumAge: 5 * 60_000,
            timeout: GEOLOCATION_TIMEOUT_MS,
          },
        );
      });
    } catch (error) {
      // PERMISSION_DENIED is final: retrying would only produce another
      // confusing prompt. TIMEOUT/POSITION_UNAVAILABLE can be transient while
      // the browser initializes its location provider after Allow is clicked.
      const code = (error as GeolocationPositionError | undefined)?.code;
      if (code === 1 || attempt === 1) return undefined;
      await new Promise((resolve) => window.setTimeout(resolve, GEOLOCATION_RETRY_DELAY_MS));
    }
  }
  return undefined;
}

async function getRequiredCoarseLocation(): Promise<Required<Pick<
  RiskClientContext,
  "geo_latitude" | "geo_longitude" | "geo_accuracy_m"
>>> {
  if (!window.isSecureContext && window.location.hostname !== "localhost") {
    throw new LocationPermissionRequiredError(
      "Vị trí chỉ hoạt động trên kết nối HTTPS. Hãy mở ứng dụng qua HTTPS rồi thử lại.",
    );
  }
  const location = await getCoarseLocation();
  if (!location) {
    throw new LocationPermissionRequiredError(
      "Cần cấp quyền vị trí gần đúng để đăng nhập và bảo vệ tài khoản.",
    );
  }
  return {
    geo_latitude: location.geo_latitude!,
    geo_longitude: location.geo_longitude!,
    geo_accuracy_m: location.geo_accuracy_m!,
  };
}

/** Collect mandatory security context from the post-login location setup page. */
export async function collectLoginRiskContext(): Promise<LoginRiskClientContext> {
  const deviceId = getStableDeviceId();
  if (!deviceId) {
    throw new LocationPermissionRequiredError(
      "Trình duyệt đang chặn bộ nhớ thiết bị cần thiết để bảo vệ đăng nhập.",
    );
  }
  return { device_id: deviceId, ...(await getRequiredCoarseLocation()) };
}

function loginLocationConfirmationKey(userId: string, deviceId: string): string {
  return `${LOGIN_LOCATION_CONFIRMED_DEVICE_PREFIX}:${userId}:${deviceId}`;
}

/**
 * Location confirmation is scoped to the account and this browser/device ID.
 * Logging in again rotates the JWT, but a known device does not need to ask
 * for the same browser permission again.
 */
export function hasConfirmedLoginLocation(userId: string | null): boolean {
  try {
    const deviceId = userId ? getStableDeviceId() : undefined;
    return Boolean(
      userId
      && deviceId
      && window.localStorage.getItem(loginLocationConfirmationKey(userId, deviceId)) === "confirmed",
    );
  } catch {
    return false;
  }
}

export function markLoginLocationConfirmed(userId: string): void {
  try {
    const deviceId = getStableDeviceId();
    if (deviceId) {
      // This marker is written only after the server accepted the location
      // context. It does not replace the server-side hashed audit record.
      window.localStorage.setItem(
        loginLocationConfirmationKey(userId, deviceId),
        "confirmed",
      );
    }
  } catch {
    // The API call remains the source of truth; a browser that blocks storage
    // will request the coarse location again on the next login.
  }
}

/**
 * Collect only data needed for risk checks. The backend HMAC-hashes the device
 * ID and never stores it or the network address in plaintext. Login location
 * is captured separately on a mandatory setup screen after authentication.
 */
export async function collectRiskClientContext(): Promise<RiskClientContext | undefined> {
  const deviceId = getStableDeviceId();
  const context: RiskClientContext = {
    ...(deviceId ? { device_id: deviceId } : {}),
  };
  return Object.keys(context).length > 0 ? context : undefined;
}
