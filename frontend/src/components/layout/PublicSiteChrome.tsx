import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Download,
  House,
  LogOut,
  Menu,
  PlayCircle,
  Sparkles,
  User as UserIcon,
  X,
} from "lucide-react";

import TimiLogo from "@/components/brand/TimiLogo";
import MobileDrawerFooter from "@/components/layout/MobileDrawerFooter";
import { useAuthStore } from "@/stores/authStore";

type PublicSiteChromeProps = {
  children: ReactNode;
};

const navLinks = [
  { href: "/", label: "Trang chủ", icon: House },
  { href: "/services", label: "Dịch vụ", icon: Sparkles },
  { href: "/demo", label: "Demo AI Anti-Scam", icon: PlayCircle },
  { href: "/download", label: "Tải app", icon: Download },
];

export default function PublicSiteChrome({ children }: PublicSiteChromeProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };

  const displayName = user?.full_name || user?.email || "Tài khoản";
  const showSignedInActions = isAuthenticated && user !== null;

  const isActive = (href: string) =>
    href === "/" ? location.pathname === "/" : location.pathname.startsWith(href);

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-white font-[Inter] text-[#0B0B0B]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      <nav className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white">
        <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20">
          <div className="flex h-16 items-center justify-between">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                className="flex cursor-pointer items-center gap-2"
                onClick={() => navigate("/")}
                aria-label="Về trang chủ Timi"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl">
                  <TimiLogo className="h-full w-full rounded-xl" />
                </span>
                <span className="font-display bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-bold text-transparent">
                  Timi
                </span>
              </button>
            </div>

            <div className="hidden items-center gap-1 xl:flex">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                    isActive(link.href)
                      ? "bg-blue-50 text-[#4F6BFF]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-[#4F6BFF]"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden items-center gap-2 xl:flex">
              {showSignedInActions ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate("/dashboard")}
                    className="flex max-w-52 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    title="Mở Dashboard"
                  >
                    <UserIcon className="h-4 w-4 shrink-0 text-violet-600" />
                    <span className="truncate">{displayName}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
                  >
                    <LogOut className="h-4 w-4" />
                    Đăng xuất
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => navigate("/login")}
                    className="rounded-full px-5 py-2 font-semibold text-[#0B0B0B] transition-colors hover:bg-slate-50"
                  >
                    Đăng nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/register")}
                    className="rounded-full bg-[#4F6BFF] px-5 py-2.5 font-bold text-white transition-colors hover:bg-[#3D53E8]"
                  >
                    Đăng ký
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              className="-mr-2 rounded-xl p-2 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700 xl:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
      </nav>

      {mobileMenuOpen && createPortal(
        <div
          className="fixed inset-0 z-[70] h-screen max-h-screen overflow-hidden overscroll-contain xl:hidden"
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
            <div className="flex h-16 items-center justify-between border-b border-slate-100 px-4">
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2">
                <TimiLogo className="h-8 w-8 rounded-lg" />
                <span className="font-display bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-lg font-bold text-transparent">Timi</span>
              </Link>
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
            <nav className="space-y-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-colors ${
                      isActive(link.href)
                        ? "bg-blue-50 text-[#4F6BFF]"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {link.label}
                  </Link>
                );
              })}
              {!showSignedInActions && (
                <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate("/login");
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-bold text-slate-800 transition-colors hover:border-violet-300 hover:bg-violet-50"
                  >
                    Đăng nhập
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate("/register");
                    }}
                    className="w-full rounded-2xl bg-[#4F6BFF] px-3 py-3 text-center text-sm font-bold text-white shadow-sm shadow-blue-200 transition-colors hover:bg-[#3D53E8]"
                  >
                    Đăng ký
                  </button>
                </div>
              )}
            </nav>
                <MobileDrawerFooter />
              </div>
            </div>

            {showSignedInActions && (
              <div className="shrink-0 border-t border-slate-100 bg-white p-3 shadow-[0_-8px_18px_rgba(15,23,42,0.04)]">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    navigate("/dashboard");
                  }}
                  className="mb-2 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <UserIcon className="h-5 w-5 text-violet-600" />
                  <span className="truncate">{displayName}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex w-full items-center gap-3 rounded-2xl bg-rose-50 px-3 py-3 text-left text-sm font-bold text-rose-600 transition-colors hover:bg-rose-100"
                >
                  <LogOut className="h-5 w-5" />
                  Đăng xuất
                </button>
              </div>
            )}
          </aside>
        </div>,
        document.body,
      )}

      {children}

      <footer className="w-full overflow-hidden bg-[#0B0B0B] py-8 text-slate-400 sm:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20">
          <div className="mb-6 grid grid-cols-2 gap-x-5 gap-y-6 sm:gap-8 md:mb-8 md:grid-cols-5">
            <div className="col-span-2 min-w-0 md:col-span-2">
              <Link to="/" className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl">
                  <TimiLogo className="h-full w-full rounded-xl" />
                </span>
                <span className="font-display bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-bold text-transparent">
                  Timi
                </span>
              </Link>
              <p className="max-w-sm text-xs leading-5 sm:text-sm sm:leading-relaxed">
                Ví điện tử thông minh được bảo vệ bởi AI. Sứ mệnh của chúng tôi là giúp mọi giao dịch của bạn đều an toàn tuyệt đối.
              </p>
            </div>
            <div className="min-w-0">
              <h4 className="mb-3 text-sm font-semibold text-white sm:mb-4">Dịch vụ</h4>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-2 sm:text-sm">
                <li><Link to="/services#transfer" className="transition-colors hover:text-[#4F6BFF]">Chuyển tiền</Link></li>
                <li><Link to="/services#bill-payment" className="transition-colors hover:text-[#4F6BFF]">Thanh toán hóa đơn</Link></li>
                <li><Link to="/services#mobile-topup" className="transition-colors hover:text-[#4F6BFF]">Nạp điện thoại</Link></li>
                <li><Link to="/services#spending" className="transition-colors hover:text-[#4F6BFF]">Quản lý chi tiêu</Link></li>
              </ul>
            </div>
            <div className="min-w-0">
              <h4 className="mb-3 text-sm font-semibold text-white sm:mb-4">Khám phá</h4>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-2 sm:text-sm">
                <li><Link to="/demo" className="transition-colors hover:text-[#4F6BFF]">Demo AI Anti-Scam</Link></li>
                <li><Link to="/mission" className="transition-colors hover:text-[#4F6BFF]">Sứ mệnh Timi</Link></li>
                <li><Link to="/download" className="transition-colors hover:text-[#4F6BFF]">Tải ứng dụng</Link></li>
              </ul>
            </div>
            <div className="col-span-2 min-w-0 md:col-span-1">
              <h4 className="mb-3 text-sm font-semibold text-white sm:mb-4">Hỗ trợ</h4>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-2 sm:text-sm">
                <li><Link to="/help" className="transition-colors hover:text-[#4F6BFF]">Trung tâm trợ giúp</Link></li>
                <li><Link to="/privacy" className="transition-colors hover:text-[#4F6BFF]">Chính sách bảo mật</Link></li>
                <li><Link to="/terms" className="transition-colors hover:text-[#4F6BFF]">Điều khoản sử dụng</Link></li>
                <li><Link to="/mission" className="transition-colors hover:text-[#4F6BFF]">Sứ mệnh Timi</Link></li>
                <li><Link to="/cookies" className="transition-colors hover:text-[#4F6BFF]">Chính sách Cookie</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-5 text-center text-xs sm:pt-8 sm:text-sm">
            © 2026 Timi. Tất cả quyền được bảo lưu.
          </div>
        </div>
      </footer>
    </div>
  );
}
