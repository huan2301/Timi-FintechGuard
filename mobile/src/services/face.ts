import { api } from '@/services/api';

export type FaceQualityResponse = {
  ready: boolean;
  rule: string;
  pose?: string | null;
  message: string;
};

export type FaceVerificationResponse = {
  matched: boolean;
  similarity: number;
  threshold: number;
  message: string;
  verification_token?: string | null;
};

export async function getFaceEnrollmentStatus() {
  const response = await api.get<{ configured: boolean }>('/v1/auth/face/enrollment/status');
  return response.data;
}

export async function checkFaceQuality(imageData: string) {
  const response = await api.post<FaceQualityResponse>('/v1/auth/face/quality', {
    image_data: imageData,
  }, { timeout: 45_000 });
  return response.data;
}

export async function enrollFace(frames: string[]) {
  const response = await api.put<FaceVerificationResponse>('/v1/auth/face/enrollment', {
    image_data: frames,
    consent: true,
  }, { timeout: 90_000 });
  return response.data;
}

export async function verifyFace(payload: {
  frames: string[];
  transactionId?: string;
  nonce?: string;
  amount?: number;
}) {
  const response = await api.post<FaceVerificationResponse>('/v1/auth/face/verify', {
    image_data: payload.frames,
    transaction_id: payload.transactionId,
    nonce: payload.nonce,
    amount: payload.amount,
  }, { timeout: 90_000 });
  return response.data;
}
