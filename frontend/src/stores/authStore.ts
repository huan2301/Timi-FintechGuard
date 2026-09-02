import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import axios from "axios";
import { authApi, User } from "@/services/api/auth";
import {
  beginExplicitLogout,
  finishExplicitLogout,
} from "@/services/api/axios";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  rememberMe: boolean;
  locationConfirmationRequired: boolean;

  setAuth: (
    token: string,
    user: User,
    rememberMe?: boolean,
    locationConfirmationRequired?: boolean,
  ) => void;
  completeLocationConfirmation: (response: {
    access_token: string;
    user: User;
  }) => void;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateUser: (partialUser: Partial<User>) => void;
}

type PersistedAuthState = Pick<
  AuthState,
  "user" | "token" | "isAuthenticated" | "isAdmin" | "rememberMe" | "locationConfirmationRequired"
>;

const authStorage = createJSONStorage<PersistedAuthState>(() => ({
  getItem: (name) => localStorage.getItem(name) ?? sessionStorage.getItem(name),
  setItem: (name, value) => {
    const parsed = JSON.parse(value) as { state?: { rememberMe?: boolean } };
    const storage = parsed.state?.rememberMe ? localStorage : sessionStorage;
    const otherStorage = parsed.state?.rememberMe ? sessionStorage : localStorage;
    otherStorage.removeItem(name);
    storage.setItem(name, value);
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
}));

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isAdmin: false,
      isLoading: false,
      rememberMe: false,
      locationConfirmationRequired: false,

      setAuth: (token, user, rememberMe = false, locationConfirmationRequired = false) => {
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
        (rememberMe ? localStorage : sessionStorage).setItem("token", token);
        set({
          token,
          user,
          isAuthenticated: true,
          isAdmin: user.role === "admin",
          rememberMe,
          locationConfirmationRequired,
        });
      },

      completeLocationConfirmation: (response) => {
        const rememberMe = get().rememberMe;
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
        (rememberMe ? localStorage : sessionStorage).setItem(
          "token",
          response.access_token,
        );
        set({
          token: response.access_token,
          user: response.user,
          isAuthenticated: true,
          isAdmin: response.user.role === "admin",
          locationConfirmationRequired: false,
        });
      },

      logout: async () => {
        beginExplicitLogout();
        try {
          await authApi.logout();
        } catch {
          // A pending-location proof is intentionally not a full app token;
          // local cleanup is still sufficient when leaving that screen.
        } finally {
          localStorage.removeItem("token");
          localStorage.removeItem("auth-storage");
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("auth-storage");
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isAdmin: false,
            rememberMe: false,
            locationConfirmationRequired: false,
          });
          finishExplicitLogout();
        }
      },

      fetchMe: async () => {
        const { token, locationConfirmationRequired } = get();
        if (!token || locationConfirmationRequired) return;
        try {
          const user = await authApi.me();
          set({
            user,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
          });
        } catch (error: unknown) {
          if (
            !axios.isAxiosError(error)
            || ![401, 403].includes(error.response?.status ?? 0)
          ) {
            return;
          }
          // Ignore a late response from a request that used a token which has
          // already been replaced by a successful login/location exchange.
          if (get().token !== token) return;
          localStorage.removeItem("token");
          localStorage.removeItem("auth-storage");
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("auth-storage");
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isAdmin: false,
            rememberMe: false,
            locationConfirmationRequired: false,
          });
        }
      },

      updateUser: (partialUser) => {
        const current = get().user;
        if (current) {
          set({ user: { ...current, ...partialUser } });
        }
      },
    }),
    {
      name: "auth-storage",
      storage: authStorage,
      partialize: (s) => ({
        user: s.user,
        token: s.token,
        isAuthenticated: s.isAuthenticated,
        isAdmin: s.isAdmin,
        rememberMe: s.rememberMe,
        locationConfirmationRequired: s.locationConfirmationRequired,
      }),
    }
  )
);
