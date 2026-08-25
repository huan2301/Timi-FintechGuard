import axiosInstance from "./axios";

export type UrlSafetyCheckResult = {
  blocked: boolean;
  hostname: string | null;
  reason: string | null;
};

export const urlSafetyApi = {
  async check(url: string): Promise<UrlSafetyCheckResult> {
    const response = await axiosInstance.post<UrlSafetyCheckResult>("/v1/url-safety/check", { url });
    return response.data;
  },
};
