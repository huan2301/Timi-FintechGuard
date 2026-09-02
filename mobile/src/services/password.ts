import { api } from '@/services/api';

type MessageResponse = { message: string };

export async function requestPasswordReset(email: string) {
  const response = await api.post<MessageResponse>('/v1/auth/forgot-password', {
    email: email.trim().toLowerCase(),
  });
  return response.data;
}

export async function resetPassword(payload: {
  email: string;
  otp: string;
  newPassword: string;
}) {
  const response = await api.post<MessageResponse>('/v1/auth/reset-password', {
    email: payload.email.trim().toLowerCase(),
    otp: payload.otp.trim(),
    new_password: payload.newPassword,
  });
  return response.data;
}
