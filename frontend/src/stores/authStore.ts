import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { authApi, User } from "@/services/api/auth";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isLoading: boolean;
  rememberMe: boolean;

  setAuth: (token: string, user: User, rememberMe?: boolean) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { full_name: string; email: string; phone: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  updateUser: (partialUser: Partial<User>) => void;
}

type PersistedAuthState = Pick<
  AuthState,
  "user" | "token" | "isAuthenticated" | "isAdmin" | "rememberMe"
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

      setAuth: (token, user, rememberMe = false) => {
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
        (rememberMe ? localStorage : sessionStorage).setItem("token", token);
        set({
          token,
          user,
          isAuthenticated: true,
          isAdmin: user.role === "admin",
          rememberMe,
        });
      },

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const response = await authApi.login({ email, password });
          const { access_token, user } = response;
          sessionStorage.setItem("token", access_token);
          set({
            token: access_token,
            user,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
            isLoading: false,
            rememberMe: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      register: async (data) => {
        set({ isLoading: true });
        try {
          const res = await authApi.register(data);
          const { access_token, user } = res;
          sessionStorage.setItem("token", access_token);
          set({
            token: access_token,
            user,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
            isLoading: false,
            rememberMe: false,
          });
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      logout: async () => {
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
        });
        await authApi.logout();
      },

      fetchMe: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const user = await authApi.me();
          set({
            user,
            isAuthenticated: true,
            isAdmin: user.role === "admin",
          });
        } catch {
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
      }),
    }
  )
);
