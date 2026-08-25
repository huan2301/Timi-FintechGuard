import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LogOut, Menu, User as UserIcon, X } from "lucide-react";

import TimiLogo from "@/components/brand/TimiLogo";
import { useAuthStore } from "@/stores/authStore";

type PublicSiteChromeProps = {
  children: ReactNode;
};

const navLinks = [
  { href: "/#features", label: "Dịch vụ" },
  { href: "/terms", label: "Điều khoản" },
  { href: "/privacy", label: "Bảo mật dữ liệu" },
  { href: "/mission", label: "Sứ mệnh" },
  { href: "/#app", label: "Tải app" },
];

export default function PublicSiteChrome({ children }: PublicSiteChromeProps) {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };

  const displayName = user?.full_name || user?.email || "Tài khoản";

  return (
    <div className="min-h-screen w-full bg-white font-[Inter] text-[#0B0B0B]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      <nav className="sticky top-0 z-50 w-full border-b border-slate-100 bg-white">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="flex h-16 items-center justify-between">
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

            <div className="hidden items-center gap-8 md:flex">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="font-medium text-slate-700 transition-colors hover:text-[#4F6BFF]"
                >
                  {link.label}
                </a>
              ))}
            </div>

            <div className="hidden items-center gap-2 md:flex">
              {isAuthenticated ? (
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
              className="p-2 text-slate-700 md:hidden"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-label={mobileMenuOpen ? "Đóng menu" : "Mở menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="space-y-3 border-t border-slate-100 bg-white px-6 py-4 md:hidden">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className="block py-2 font-medium text-slate-700"
              >
                {link.label}
              </a>
            ))}
            <hr className="border-slate-100" />
            {isAuthenticated ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="flex w-full items-center gap-2 py-2 text-left font-semibold text-slate-700"
                >
                  <UserIcon className="h-4 w-4 text-violet-600" />
                  <span className="truncate">{displayName}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="flex w-full items-center gap-2 rounded-full py-2.5 text-left font-semibold text-rose-600"
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
                  className="block w-full py-2 text-left font-semibold text-[#0B0B0B]"
                >
                  Đăng nhập
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/register")}
                  className="w-full rounded-full bg-[#4F6BFF] py-2.5 font-bold text-white"
                >
                  Đăng ký
                </button>
              </>
            )}
          </div>
        )}
      </nav>

      {children}

      <footer className="w-full bg-[#0B0B0B] py-12 text-slate-400">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="mb-8 grid gap-8 md:grid-cols-4">
            <div className="col-span-2">
              <Link to="/" className="mb-4 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl">
                  <TimiLogo className="h-full w-full rounded-xl" />
                </span>
                <span className="font-display bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-2xl font-bold text-transparent">
                  Timi
                </span>
              </Link>
              <p className="max-w-sm text-sm leading-relaxed">
                Ví điện tử thông minh được bảo vệ bởi AI. Sứ mệnh của chúng tôi là giúp mọi giao dịch của bạn đều an toàn tuyệt đối.
              </p>
            </div>
            <div>
              <h4 className="mb-4 font-semibold text-white">Dịch vụ</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="/#features" className="transition-colors hover:text-[#4F6BFF]">Chuyển tiền</a></li>
                <li><a href="/#features" className="transition-colors hover:text-[#4F6BFF]">Thanh toán hóa đơn</a></li>
                <li><a href="/#features" className="transition-colors hover:text-[#4F6BFF]">Nạp điện thoại</a></li>
                <li><a href="/#features" className="transition-colors hover:text-[#4F6BFF]">Quản lý chi tiêu</a></li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 font-semibold text-white">Hỗ trợ</h4>
              <ul className="space-y-2 text-sm">
                <li><Link to="/help" className="transition-colors hover:text-[#4F6BFF]">Trung tâm trợ giúp</Link></li>
                <li><Link to="/privacy" className="transition-colors hover:text-[#4F6BFF]">Chính sách bảo mật</Link></li>
                <li><Link to="/terms" className="transition-colors hover:text-[#4F6BFF]">Điều khoản sử dụng</Link></li>
                <li><Link to="/mission" className="transition-colors hover:text-[#4F6BFF]">Sứ mệnh Timi</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-center text-sm">
            © 2026 Timi. Tất cả quyền được bảo lưu.
          </div>
        </div>
      </footer>
    </div>
  );
}
