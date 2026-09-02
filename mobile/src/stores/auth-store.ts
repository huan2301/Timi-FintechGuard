import { create } from 'zustand';

import {
  clearSession,
  completeGooglePhone as completeGooglePhoneRequest,
  loginWithPassword,
  loginWithGoogleCredential,
  getCurrentUser,
  requestRegistration,
  restoreSession,
  verifyRegistration,
} from '@/services/auth';
import type { GooglePhoneCompletionResponse, User } from '@/types/api';

export interface RegistrationPayload {
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  busy: boolean;
  demoMode: boolean;
  googleCompletion: GooglePhoneCompletionResponse | null;
  hydrate: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<'authenticated' | 'phone_required'>;
  completeGooglePhone: (phone: string) => Promise<void>;
  cancelGoogleCompletion: () => void;
  requestOtp: (payload: RegistrationPayload) => Promise<void>;
  completeRegistration: (payload: RegistrationPayload, otp: string) => Promise<void>;
  enterDemo: () => void;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

const demoUser: User = {
  id: 'demo-user',
  email: 'demo@timi.vn',
  phone: '090 123 4567',
  full_name: 'Nguyễn Minh Anh',
  role: 'user',
  is_active: true,
  balance: 24_680_000,
  timi_bank_enabled: true,
  is_google_account: false,
  created_at: new Date().toISOString(),
};

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  hydrated: false,
  busy: false,
  demoMode: false,
  googleCompletion: null,

  hydrate: async () => {
    try {
      const session = await restoreSession();
      set({
        token: session?.token ?? null,
        user: session?.user ?? null,
      });
    } catch {
      // A SecureStore failure must not leave the root layout on its splash
      // screen forever. Treat the local session as unavailable and continue.
      try {
        await clearSession();
      } catch {
        // The in-memory token is already cleared by clearSession().
      }
      set({ token: null, user: null, demoMode: false, googleCompletion: null });
    } finally {
      set({ hydrated: true });
    }
  },

  login: async (email, password) => {
    set({ busy: true });
    try {
      const response = await loginWithPassword(email, password);
      set({ token: response.access_token, user: response.user, demoMode: false, googleCompletion: null });
    } finally {
      set({ busy: false });
    }
  },

  loginWithGoogle: async (credential) => {
    set({ busy: true });
    try {
      const response = await loginWithGoogleCredential(credential);
      if ('access_token' in response) {
        set({ token: response.access_token, user: response.user, demoMode: false, googleCompletion: null });
        return 'authenticated';
      }
      set({ googleCompletion: response });
      return 'phone_required';
    } finally {
      set({ busy: false });
    }
  },

  completeGooglePhone: async (phone) => {
    const completion = get().googleCompletion;
    if (!completion) throw new Error('Phiên đăng nhập Google đã hết hạn.');

    set({ busy: true });
    try {
      const response = await completeGooglePhoneRequest(completion.phone_completion_token, phone);
      set({ token: response.access_token, user: response.user, demoMode: false, googleCompletion: null });
    } finally {
      set({ busy: false });
    }
  },

  cancelGoogleCompletion: () => set({ googleCompletion: null }),

  requestOtp: async (payload) => {
    set({ busy: true });
    try {
      await requestRegistration(payload);
    } finally {
      set({ busy: false });
    }
  },

  completeRegistration: async (payload, otp) => {
    set({ busy: true });
    try {
      const response = await verifyRegistration(payload, otp);
      set({ token: response.access_token, user: response.user, demoMode: false, googleCompletion: null });
    } finally {
      set({ busy: false });
    }
  },

  enterDemo: () => set({ user: demoUser, token: null, demoMode: true, googleCompletion: null }),

  refreshUser: async () => {
    const user = await getCurrentUser();
    set({ user });
  },

  logout: async () => {
    await clearSession();
    set({ token: null, user: null, demoMode: false, googleCompletion: null });
  },
}));
