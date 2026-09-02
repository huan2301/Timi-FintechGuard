import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  ChevronRight,
  Home,
  Send,
  History,
  Menu,
  User,
  LogOut,
  QrCode,
  ShieldCheck,
  X,
} from "lucide-react";
import MiniTimiAssistant from "@/components/ai/MiniTimiAssistant";
import ScamGuardianAlert from "@/components/guardian/ScamGuardianAlert";
import GuardianDiagnostics from "@/components/guardian/GuardianDiagnostics";
import GuardianStatusNotice from "@/components/guardian/GuardianStatusNotice";
import { ScamGuardianProvider } from "@/components/guardian/ScamGuardianProvider";
import PinSetupEnforcer from "@/components/auth/PinSetupEnforcer";
import TimiLogo from "@/components/brand/TimiLogo";
import MobileDrawerFooter from "@/components/layout/MobileDrawerFooter";

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAdmin } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
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
      <div className="min-h-screen w-full overflow-x-clip bg-[#f5f3ff]">
        {/* Top Navbar */}
        <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-lg border-b border-violet-100/80 shadow-sm shadow-violet-50/40">
          <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 h-16 flex items-center justify-between">
            {/* Logo */}
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => navigate("/dashboard")}
                className="flex min-w-0 items-center gap-2.5 group shrink-0"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <TimiLogo className="h-full w-full rounded-xl" />
                </div>
                <span className="truncate text-xl font-bold tracking-tight">
                  <span className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">
                    Timi
                  </span>
                  <span className="text-slate-700 hidden sm:inline"> Banking</span>
                </span>
              </button>
            </div>

            {/* Desktop nav */}
            <nav className="hidden lg:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className={`flex items-center gap-2 px-2 py-2 rounded-xl text-sm font-semibold transition-all xl:px-3.5 ${
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
              className="hidden lg:flex items-center gap-2 px-3.5 py-2 text-sm font-semibold text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="-mr-2 rounded-xl p-2 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700 lg:hidden"
              aria-label="Mở menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </header>

        {mobileMenuOpen && createPortal(
          <div
            className="fixed inset-0 z-[70] h-screen max-h-screen overflow-hidden overscroll-contain lg:hidden"
            style={{ height: "100dvh" }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu điều hướng"
          >
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/35 backdrop-blur-[2px]"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Đóng menu"
            />
            <aside className="relative ml-auto flex h-full w-[min(20rem,calc(100vw-3rem))] flex-col overflow-hidden bg-white shadow-2xl shadow-slate-900/20">
              <div className="flex h-16 items-center justify-between border-b border-violet-100 px-4">
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="flex items-center gap-2"
                  aria-label="Về trang chủ Timi"
                >
                  <TimiLogo className="h-8 w-8 rounded-lg" />
                  <span className="text-lg font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Timi</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Đóng menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="flex min-h-full flex-col px-3 py-4">
                <nav className="grid gap-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    return (
                      <div key={item.path}>
                        <button
                          type="button"
                          onClick={() => navigate(item.path)}
                          className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition-colors ${
                            active
                              ? "bg-violet-50 text-violet-700"
                              : "text-slate-700 hover:bg-slate-50"
                          }`}
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          <span className="flex-1">{item.label}</span>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </button>
                        {item.path === "/me" && (
                          <div className="mt-5 border-t border-slate-100 pt-4">
                            <button
                              type="button"
                              onClick={() => void handleLogout()}
                              className="flex w-full items-center gap-3 rounded-2xl bg-rose-50 px-3 py-3 text-left text-sm font-bold text-rose-600 transition-colors hover:bg-rose-100"
                            >
                              <LogOut className="h-5 w-5" />
                              <span className="flex-1">Đăng xuất</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>
                <MobileDrawerFooter />
                </div>
              </div>
            </aside>
          </div>,
          document.body,
        )}

        {/* Content */}
        <main className="w-full pb-0">
          <Outlet />
        </main>

        <MiniTimiAssistant />
        <ScamGuardianAlert />
        <GuardianStatusNotice />
        <GuardianDiagnostics />
      </div>
    </ScamGuardianProvider>
  );
}
