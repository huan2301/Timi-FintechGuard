import axiosInstance from "./axios";
import type { LoginRiskClientContext } from "@/utils/riskTelemetry";

export interface User {
  id: string;
  email: string;
  phone?: string | null;
  avatar_url?: string | null;
  full_name: string;
  role: "user" | "admin";
  is_active: boolean;
  balance: number;
  timi_bank_enabled: boolean;
  is_google_account: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface AccountOverview {
  balance: number;
  transactions_today: number;
  transactions_this_month: number;
  security_score: number;
  security_grade: string;
  transaction_pin_configured: boolean;
  phone_configured: boolean;
  security_checks: SecurityCheck[];
}

export interface SecurityCheck {
  label: string;
  detail: string;
  score: number;
  completed: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember_me?: boolean;
}

export interface GoogleLoginRequest {
  credential: string;
  remember_me?: boolean;
}

export interface GooglePhoneCompletionResponse {
  requires_phone: true;
  phone_completion_token: string;
  email: string;
  full_name: string;
}

export type GoogleLoginResponse = TokenResponse | GooglePhoneCompletionResponse;

export interface RegisterRequest {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

export interface RegisterOtpRequest {
  email: string;
  otp: string;
}

export interface LoginLocationRequest {
  client_context: LoginRiskClientContext;
}

export interface LoginLocationResponse {
  recorded: boolean;
}

export interface FaceVerificationResponse {
  matched: boolean;
  similarity: number;
  threshold: number;
  message: string;
  verification_token?: string | null;
}

export const authApi = {
  login: async (data: LoginRequest): Promise<TokenResponse> => {
    const response = await axiosInstance.post<TokenResponse>("/v1/auth/login", data);
    return response.data;
  },

  loginWithGoogle: async (data: GoogleLoginRequest): Promise<GoogleLoginResponse> => {
    const response = await axiosInstance.post<GoogleLoginResponse>("/v1/auth/google", data);
    return response.data;
  },

  completeGooglePhone: async (data: { phone_completion_token: string; phone: string }): Promise<TokenResponse> => {
    const response = await axiosInstance.post<TokenResponse>("/v1/auth/google/complete-phone", data);
    return response.data;
  },

  recordLoginLocation: async (data: LoginLocationRequest): Promise<LoginLocationResponse> => {
    const response = await axiosInstance.post<LoginLocationResponse>("/v1/auth/login/location", data);
    return response.data;
  },

  register: async (data: RegisterRequest): Promise<TokenResponse> => {
    const response = await axiosInstance.post<TokenResponse>("/v1/auth/register", data);
    return response.data;
  },

  requestRegisterOtp: async (data: RegisterRequest): Promise<{ message: string }> => {
    const response = await axiosInstance.post<{ message: string }>("/v1/auth/register/request-otp", data);
    return response.data;
  },

  checkRegisterAvailability: async (data: { email?: string; phone?: string }): Promise<{
    email_available: boolean;
    phone_available: boolean;
    email_message?: string;
    phone_message?: string;
  }> => {
    const response = await axiosInstance.post("/v1/auth/register/check-availability", data);
    return response.data;
  },

  verifyRegisterOtp: async (data: RegisterOtpRequest): Promise<TokenResponse> => {
    const response = await axiosInstance.post<TokenResponse>("/v1/auth/register/verify-otp", data);
    return response.data;
  },

  me: async (): Promise<User> => {
    const response = await axiosInstance.get<User>("/v1/auth/me");
    return response.data;
  },

  requestEmailChange: async (newEmail: string): Promise<{ message: string }> => {
    const response = await axiosInstance.post<{ message: string }>("/v1/auth/email-change/request", { new_email: newEmail });
    return response.data;
  },

  verifyEmailChange: async (oldOtp: string, newOtp: string): Promise<User> => {
    const response = await axiosInstance.post<User>("/v1/auth/email-change/verify", { old_otp: oldOtp, new_otp: newOtp });
    return response.data;
  },

  overview: async (): Promise<AccountOverview> => {
    const response = await axiosInstance.get<AccountOverview>("/v1/auth/overview");
    return response.data;
  },

  uploadAvatar: async (avatar: File): Promise<User> => {
    const formData = new FormData();
    formData.append("avatar", avatar);
    const response = await axiosInstance.put<User>("/v1/auth/avatar", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    });
    return response.data;
  },

  deleteAvatar: async (): Promise<User> => {
    const response = await axiosInstance.delete<User>("/v1/auth/avatar");
    return response.data;
  },

  verifyFace: async (imageData: string | string[], transactionId?: string, nonce?: string, amount?: number): Promise<FaceVerificationResponse> => {
    const response = await axiosInstance.post<FaceVerificationResponse>("/v1/auth/face/verify", {
      image_data: imageData,
      transaction_id: transactionId,
      nonce,
      amount,
    }, { timeout: 120_000 });
    return response.data;
  },

  checkFaceQuality: async (imageData: string): Promise<{ ready: boolean; rule: string; message: string; pose?: "left" | "right" | "center" | null }> => {
    const response = await axiosInstance.post<{ ready: boolean; rule: string; message: string; pose?: "left" | "right" | "center" | null }>(
      "/v1/auth/face/quality",
      { image_data: imageData },
      // The first quality request may download the lightweight YuNet/SFace
      // files on a fresh backend instance. Later requests use the cached model.
      { timeout: 30_000 },
    );
    return response.data;
  },

  enrollFace: async (imageData: string | string[]): Promise<FaceVerificationResponse> => {
    const response = await axiosInstance.put<FaceVerificationResponse>("/v1/auth/face/enrollment", {
      image_data: imageData,
      consent: true,
    }, { timeout: 120_000 });
    return response.data;
  },

  setTransactionPin: async (pin: string, currentPin?: string): Promise<{ configured: boolean }> => {
    const response = await axiosInstance.put<{ configured: boolean }>("/v1/auth/transaction-pin", {
      pin,
      ...(currentPin ? { current_pin: currentPin } : {}),
    });
    return response.data;
  },

  transactionPinStatus: async (): Promise<{ configured: boolean }> => {
    const response = await axiosInstance.get<{ configured: boolean }>("/v1/auth/transaction-pin/status");
    return response.data;
  },

  faceEnrollmentStatus: async (): Promise<{ configured: boolean }> => {
    const response = await axiosInstance.get<{ configured: boolean }>("/v1/auth/face/enrollment/status");
    return response.data;
  },

  logout: async () => {
    localStorage.removeItem("token");
  },
forgotPassword: (email: string) =>
  axiosInstance.post("/v1/auth/forgot-password", { email }),

resetPassword: (payload: {
  email: string;
  otp: string;
  new_password: string;
}) => axiosInstance.post("/v1/auth/reset-password", payload),
};
