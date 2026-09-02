import { api } from '@/services/api';

export interface UrlSafetyResult {
  blocked: boolean;
  hostname: string | null;
  reason?: string | null;
}

export async function checkUrlSafety(url: string) {
  const response = await api.post<UrlSafetyResult>('/v1/url-safety/check', { url });
  return response.data;
}
