import * as SecureStore from 'expo-secure-store';

import { api, setApiAccessToken } from '@/services/api';
import type { GooglePhoneCompletionResponse, TokenResponse, User } from '@/types/api';

const TOKEN_KEY = 'timi.access-token';

export async function restoreSession(): Promise<{ token: string; user: User } | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return null;

  setApiAccessToken(token);
  try {
    const response = await api.get<User>('/v1/auth/me');
    return { token, user: response.data };
  } catch {
    await clearSession();
    return null;
  }
}

export async function saveSession(response: TokenResponse) {
  await SecureStore.setItemAsync(TOKEN_KEY, response.access_token);
  setApiAccessToken(response.access_token);
}

export async function clearSession() {
  setApiAccessToken(null);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function getCurrentUser() {
  const response = await api.get<User>('/v1/auth/me');
  return response.data;
}

export async function loginWithPassword(email: string, password: string) {
  const response = await api.post<TokenResponse>('/v1/auth/login', {
    email: email.trim().toLowerCase(),
    password,
    remember_me: true,
  });
  await saveSession(response.data);
  return response.data;
}

export async function requestRegistration(payload: {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}) {
  await api.post('/v1/auth/register/request-otp', payload);
}

export async function verifyRegistration(
  payload: { full_name: string; email: string; phone: string; password: string },
  otp: string,
) {
  const response = await api.post<TokenResponse>('/v1/auth/register/verify-otp', {
    ...payload,
    otp,
  });
  await saveSession(response.data);
  return response.data;
}

export async function loginWithGoogleCredential(credential: string) {
  const response = await api.post<TokenResponse | GooglePhoneCompletionResponse>('/v1/auth/google', {
    credential,
    remember_me: true,
  });
  if ('access_token' in response.data) {
    await saveSession(response.data);
  }
  return response.data;
}

export async function completeGooglePhone(phoneCompletionToken: string, phone: string) {
  const response = await api.post<TokenResponse>('/v1/auth/google/complete-phone', {
    phone_completion_token: phoneCompletionToken,
    phone,
  });
  await saveSession(response.data);
  return response.data;
}
