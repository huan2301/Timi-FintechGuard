import axios from "axios";

type ApiErrorBody = {
  detail?: unknown;
};

export function getApiErrorDetail(error: unknown): unknown {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return undefined;
  return error.response?.data?.detail;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const detail = getApiErrorDetail(error);
  return typeof detail === "string" && detail.trim() ? detail : fallback;
}
