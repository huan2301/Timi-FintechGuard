import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  Home,
  Send,
  History,
  User,
  LogOut,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import MiniTimiAssistant from "@/components/ai/MiniTimiAssistant";
import ScamGuardianAlert from "@/components/guardian/ScamGuardianAlert";
import { ScamGuardianProvider } from "@/components/guardian/ScamGuardianProvider";
import PinSetupEnforcer from "@/components/auth/PinSetupEnforcer";
import TimiLogo from "@/components/brand/TimiLogo";

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAdmin } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const navItems = [
    { path: "/dashboard", label: "Trang chủ", icon: Home },
    { path: "/transfer", label: "Chuyển tiền", icon: Send },
    { path: "/qr", label: "QR", icon: QrCode },
    { path: "/history", label: "Lịch sử", icon: History },
    ...(isAdmin
      ? [{ path: "/admin", label: "Admin", icon: ShieldCheck }]
      : []),
    { path: "/me", label: "Tài khoản", icon: User },
  ];

  const isActive = (path: string) => {
    if (path === "/dashboard") return location.pathname === "/dashboard";
    return location.pathname.startsWith(path);
  };

  return (
    <ScamGuardianProvider>
      <PinSetupEnforcer />
      <div className="min-h-screen bg-[#f5f3ff] w-full">
        {/* Top Navbar */}
        <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-lg border-b border-violet-100/80 shadow-sm shadow-violet-50/40">
          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 h-16 flex items-center justify-between">
            {/* Logo */}
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center gap-2.5 group shrink-0"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                <TimiLogo className="h-full w-full rounded-xl" />
              </div>
              <span className="text-xl font-bold tracking-tight">
                <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                  Timi
                </span>
                <span className="text-slate-700 hidden sm:inline"> Banking</span>
              </span>
            </button>

            {/* Desktop nav */}
            <nav className="hidden sm:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                      active
                        ? "bg-violet-50 text-violet-700 shadow-sm"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${
                        active ? "text-violet-600" : "text-slate-400"
                      }`}
                      strokeWidth={active ? 2.5 : 2}
                    />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            {/* Logout */}
            <button
              onClick={() => void handleLogout()}
              className="flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="w-full pb-20 sm:pb-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Nav */}
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-lg border-t border-violet-100/80 px-2 py-2 flex items-center justify-around shadow-[0_-4px_20px_rgba(139,92,246,0.06)]">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-xl transition-all min-w-[56px] ${
                  active ? "text-violet-600" : "text-slate-400"
                }`}
              >
                <div
                  className={`flex items-center justify-center w-10 h-8 rounded-xl transition-colors ${
                    active ? "bg-violet-50" : ""
                  }`}
                >
                  <Icon
                    className="w-5 h-5"
                    strokeWidth={active ? 2.5 : 2}
                  />
                </div>
                <span className="text-[10px] font-semibold">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <MiniTimiAssistant />
        <ScamGuardianAlert />
      </div>
    </ScamGuardianProvider>
  );
}
