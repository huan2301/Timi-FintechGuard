import { create } from 'axios';
import { Platform } from 'react-native';

const localApiUrl = Platform.select({
  android: 'http://10.0.2.2:8000/api',
  default: 'http://localhost:8000/api',
});

export const apiBaseUrl = (
  process.env.EXPO_PUBLIC_API_URL || localApiUrl || 'http://localhost:8000/api'
).replace(/\/$/, '');

let accessToken: string | null = null;

export function setApiAccessToken(token: string | null) {
  accessToken = token;
}

export const api = create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,
});

api.interceptors.request.use((config) => {
  if (accessToken && config.headers) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});
