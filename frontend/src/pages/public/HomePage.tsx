import { Link, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  Shield,
  ArrowRight,
  Zap,
  KeyRound,
  Smartphone,
  CreditCard,
  Users,
  Headphones,
  CheckCircle2,
  ShieldCheck,
  Building2,
  Menu,
  X,
  User as UserIcon,
  LogOut,
  Star,
  Play,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import TimiLogo from "@/components/brand/TimiLogo";
import MobileDrawerFooter from "@/components/layout/MobileDrawerFooter";
import { useAuthStore } from "@/stores/authStore";
import { axiosInstance } from "@/services/api/axios";

/* ------------------------------------------------------------------ */
/*  Nội dung                                                          */
/* ------------------------------------------------------------------ */

const trustRow = [
  { icon: Users, title: "Bản demo minh bạch", desc: "Dữ liệu tài chính và giao dịch ngoài Timi được ghi rõ là mô phỏng", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/41.jpg" },
  { icon: Star, title: "Giải thích rủi ro", desc: "Hiển thị tín hiệu và lý do cảnh báo trước khi bạn quyết định", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/42.jpg" },
  { icon: Headphones, title: "Trung tâm trợ giúp", desc: "Tài liệu hướng dẫn và trợ lý trong ứng dụng cho các luồng đang hỗ trợ", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/43.png" },
];

const protectionRow = [
  { icon: ShieldCheck, title: "Phân tích chống lừa đảo", desc: "Đánh giá tín hiệu rủi ro trước bước xác nhận giao dịch", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/44.png" },
  { icon: KeyRound, title: "Xác thực 2 lớp", desc: "Bảo vệ tài khoản bằng sinh trắc học và OTP", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/45.jpg" },
  { icon: Building2, title: "Kiểm tra dữ liệu nội bộ", desc: "Đối chiếu danh bạ người nhận, blacklist và lịch sử cảnh báo của hệ thống", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/46.jpg" },
];

const exampleScenarios = [
  {
    quote:
      "Khi chuyển tới người nhận mới, Timi hiển thị kết quả tra cứu và các tín hiệu đáng ngờ trước bước xác nhận.",
    name: "Tra cứu người nhận",
    theme: "light",
  },
  {
    quote:
      "Nếu nội dung giao dịch có dấu hiệu rủi ro, hệ thống giải thích lý do để người dùng tự đưa ra quyết định.",
    name: "Giải thích rủi ro",
    theme: "dark",
  },
  {
    quote:
      "Guardian có thể gửi cảnh báo bảo mật trong ứng dụng; quyết định tiếp tục hay hủy vẫn thuộc về người dùng.",
    name: "Cảnh báo chủ động",
    theme: "light",
  },
];

const features = [
  {
    icon: ArrowRight,
    title: "Chuyển tiền có kiểm soát",
    desc: "Chuyển tiền giữa hai tài khoản Timi; liên ngân hàng được khóa cho tới khi có cổng quyết toán thật",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/32.jpg",
  },
  {
    icon: CreditCard,
    title: "Thẻ ảo mô phỏng",
    desc: "Tạo và quản lý thẻ thử nghiệm với PIN xác nhận; không phải thẻ ngân hàng thật",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/32.jpg",
  },
  {
    icon: Shield,
    title: "AI Anti-Scam",
    desc: "Trí tuệ nhân tạo phân tích tín hiệu và cảnh báo rủi ro trước khi bạn xác nhận",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/32.jpg",
  },
];

const heroBanners = [
  "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/13.jpg",
  "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/14.jpg",
  "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/22.jpg",
  "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/23.jpg",
  "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/35.png",
];

/* ------------------------------------------------------------------ */
/*  Trang chủ                                                         */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeBanner, setActiveBanner] = useState(0);
  const managedQuery = useQuery({
    queryKey: ["public-content", "home"],
    queryFn: async () => (await axiosInstance.get<Array<{ id: string; title: string | null; body: string | null; image_url: string | null }>>("/v1/content/home")).data,
  });

  useEffect(() => {
    const id = setInterval(() => {
      setActiveBanner((i) => (i + 1) % heroBanners.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const handleLogout = async () => {
    await logout();
    setMobileMenuOpen(false);
  };

  const displayName = user?.full_name || user?.email || "Tài khoản";
  const showSignedInActions = isAuthenticated && user !== null;

  return (
    <div className="min-h-screen w-full overflow-x-clip bg-white font-[Inter]">
      {/* ============================= NAV ============================= */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-100 w-full">
        <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20">
          <div className="flex items-center justify-between h-16">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2"
                onClick={() => navigate("/")}
                aria-label="Về trang chủ Timi"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <TimiLogo className="h-full w-full rounded-xl" />
                </div>
                <span className="font-display text-2xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Timi</span>
              </button>
            </div>

            <div className="hidden xl:flex items-center gap-1">
              <Link to="/" className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#4F6BFF]">Trang chủ</Link>
              <Link to="/services" className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#4F6BFF]">Dịch vụ</Link>
              <Link to="/demo" className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#4F6BFF]">Demo AI Anti-Scam</Link>
              <Link to="/download" className="rounded-full px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-[#4F6BFF]">Tải app</Link>
            </div>

            <div className="hidden xl:flex items-center gap-2">
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
                  <button onClick={() => navigate("/login")} className="px-5 py-2 text-[#0B0B0B] font-semibold hover:bg-slate-50 rounded-full transition-colors">
                    Đăng nhập
                  </button>
                  <button onClick={() => navigate("/register")} className="px-5 py-2.5 bg-[#4F6BFF] text-white font-bold rounded-full hover:bg-[#3D53E8] transition-colors">
                    Đăng ký
                  </button>
                </>
              )}
            </div>
            <button
              type="button"
              aria-label="Mở menu"
              aria-expanded={mobileMenuOpen}
              className="-mr-2 rounded-xl p-2 text-slate-700 transition-colors hover:bg-violet-50 hover:text-violet-700 xl:hidden"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu className="w-6 h-6" />
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
              <Link to="/" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-2xl bg-blue-50 px-3 py-3 text-sm font-semibold text-[#4F6BFF]">
                <Shield className="h-5 w-5" />
                Trang chủ
              </Link>
              <Link to="/services" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Zap className="h-5 w-5" />
                Dịch vụ
              </Link>
              <Link to="/demo" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Play className="h-5 w-5" />
                Demo AI Anti-Scam
              </Link>
              <Link to="/download" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Smartphone className="h-5 w-5" />
                Tải ứng dụng
              </Link>
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
                  className="flex w-full items-center gap-3 rounded-2xl bg-rose-50 px-3 py-3 text-left text-sm font-bold text-rose-600 hover:bg-rose-100"
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

      {/* ============================= HERO ============================= */}
      <section className="w-full bg-white">
        <div className="w-full px-6 lg:px-12 xl:px-20 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <h1 className="font-display text-5xl lg:text-7xl font-bold text-[#0B0B0B] leading-[1.02] tracking-tight">
                GIỮ TIỀN AN TOÀN.<br />CHI TIÊU DỄ DÀNG.
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed max-w-md">
                Timi là bản demo ví điện tử có AI Anti-Scam — hỗ trợ chuyển tiền nội bộ, QR, lịch sử và giải thích rủi ro trong một trải nghiệm thống nhất.
              </p>
              <button onClick={() => navigate("/register")} className="px-8 py-4 bg-[#4F6BFF] text-white font-bold rounded-2xl hover:bg-[#3D53E8] hover:scale-[1.02] transition-all inline-flex items-center gap-2">
                Tạo tài khoản thử nghiệm
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            {/* Banner ngang chạy ảnh tự động thay cho widget cũ */}
            <div className="relative flex justify-end">
              <div className="relative w-full max-w-md aspect-[16/9] rounded-[2rem] overflow-hidden shadow-2xl bg-gradient-to-br from-[#3D5AFB] to-[#6C4CE0]">
                {heroBanners.map((src, i) => (
                  <img
                    key={src}
                    src={src}
                    alt={`Banner ${i + 1}`}
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
                      i === activeBanner ? "opacity-100" : "opacity-0"
                    }`}
                  />
                ))}

                {/* chấm chỉ báo vị trí */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {heroBanners.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === activeBanner ? "w-5 bg-white" : "w-1.5 bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* trust row */}
          <div className="grid sm:grid-cols-3 gap-8 mt-20 pt-12 border-t border-slate-100">
            {trustRow.map((t) => (
              <div key={t.title} className="flex flex-col gap-3">
                <img src={t.image} alt={t.title} className="w-full h-32 object-cover rounded-2xl mb-1" />
                <t.icon className="w-6 h-6 text-[#4F6BFF]" />
                <p className="font-bold text-[#0B0B0B]">{t.title}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== "DISAPPOINT THIEVES" ===================== */}
      <section className="w-full bg-white">
        <div className="w-full px-6 lg:px-12 xl:px-20 py-16 lg:py-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="font-display text-4xl lg:text-6xl font-bold text-[#0B0B0B] leading-tight mb-6">
                LÀM NẢN LÒNG<br />KẺ GIAN
              </h2>
              <p className="text-slate-600 text-lg leading-relaxed max-w-md mb-6">
                Trong bản demo, AI Anti-Scam phân tích từng yêu cầu chuyển tiền để giải thích tín hiệu đáng ngờ trước khi bạn xác nhận.
              </p>
              <button onClick={() => document.getElementById("security")?.scrollIntoView({ behavior: "smooth" })} className="text-[#4F6BFF] font-bold underline underline-offset-4 hover:text-[#4F6BFF] transition-colors">
                Xem cách chúng tôi bảo vệ bạn
              </button>
            </div>

            {/* Ảnh minh hoạ ổ khoá */}
            <div className="flex justify-center lg:justify-end">
              <img src="https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/40.png" alt="Bảo mật Timi" className="w-64 h-64 object-contain" />
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-8 mt-16 pt-12 border-t border-slate-100">
            {protectionRow.map((t) => (
              <div key={t.title} className="flex flex-col gap-3">
                <img src={t.image} alt={t.title} className="w-full h-32 object-cover rounded-2xl mb-1" />
                <t.icon className="w-6 h-6 text-[#4F6BFF]" />
                <p className="font-bold text-[#0B0B0B]">{t.title}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{t.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== EXAMPLE SCENARIOS (xanh) ===================== */}
      <section className="w-full bg-[#F3F5FF]">
        <div className="w-full px-6 lg:px-12 xl:px-20 py-16 lg:py-20">
          <div className="mb-10">
            <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0B0B0B] leading-tight">
              TÌNH HUỐNG<br />MINH HỌA
            </h2>
            <p className="mt-3 max-w-2xl text-slate-600">
              Các ví dụ dưới đây mô tả luồng bảo vệ trong bản demo, không phải lời chứng thực của khách hàng.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {exampleScenarios.map((t) => (
              <div
                key={t.name}
                className={`rounded-3xl p-8 flex flex-col justify-between min-h-[240px] shadow-sm ${
                  t.theme === "dark" ? "bg-gradient-to-br from-[#3D5AFB] to-[#6C4CE0] text-white" : "bg-[#E9ECFF] text-[#0B0B0B]"
                }`}
              >
                <div>
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center mb-4 ${
                    t.theme === "dark" ? "bg-white/15" : "bg-white/70"
                  }`}>
                    <ShieldCheck className={`w-5 h-5 ${t.theme === "dark" ? "text-white" : "text-[#4F6BFF]"}`} />
                  </div>
                  <p className="leading-relaxed font-medium">"{t.quote}"</p>
                </div>
                <div className={`mt-6 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${
                  t.theme === "dark" ? "bg-white/10" : "bg-white/60"
                }`}>
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {t.name} · Bản demo Timi
                </div>
              </div>
            ))}
          </div>

          {/* MEET MONEY WITHOUT BORDERS -> Tiền bạc không còn giới hạn */}
          <div className="mt-16 bg-gradient-to-br from-[#3D5AFB] to-[#6C4CE0] rounded-[2.5rem] px-8 py-16 lg:py-24 flex flex-col items-center text-center relative overflow-hidden">
            <div className="mb-8 w-40 h-40 flex items-center justify-center">
              <img src="https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/plant.png" alt="Timi" className="w-full h-full object-contain" />
            </div>
            <h2 className="font-display text-3xl lg:text-5xl font-bold text-white leading-tight max-w-2xl">
              TIỀN BẠC KHÔNG<br />CÒN GIỚI HẠN
            </h2>
            <p className="text-slate-300 mt-4 max-w-xl">
              Timi minh họa cách tra cứu người nhận, chuyển tiền nội bộ và giải thích tín hiệu rủi ro trong một luồng rõ ràng.
            </p>
            <Link to="/mission" className="mt-8 px-7 py-3.5 bg-white text-[#4F6BFF] font-bold rounded-full hover:bg-slate-100 transition-colors">
              Tìm hiểu sứ mệnh của Timi
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== AI SECURITY (giữ nền tối) ===================== */}
      <section id="security" className="py-20 bg-[#0B0B0B] text-white w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full border border-white/20">
                <Shield className="w-4 h-4 text-[#4F6BFF]" />
                <span className="text-sm font-medium">Bản demo AI Anti-Scam</span>
              </div>

              <h2 className="font-display text-3xl lg:text-5xl font-bold leading-tight">
                AI Anti-Scam Agent<br />
                <span className="text-[#4F6BFF]">bảo vệ chủ động</span>
              </h2>

              <p className="text-slate-300 text-lg leading-relaxed">
                Hệ thống phân tích dữ liệu giao dịch và các tín hiệu nội bộ để giải thích mức rủi ro trước khi người dùng xác nhận.
              </p>

              <div className="space-y-4 pt-4">
                {[
                  "Phân tích tín hiệu bất thường trước bước xác nhận",
                  "Đối chiếu blacklist và tín hiệu rủi ro nội bộ",
                  "Xác thực đa lớp cho giao dịch lớn",
                  "Can thiệp AI thông minh khi phát hiện rủi ro",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-[#4F6BFF] flex-shrink-0" />
                    <span className="text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-[2.5rem] p-8 w-full max-w-lg ml-auto space-y-4">
                <div className="flex items-center gap-4 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl">
                  <Shield className="w-8 h-8 text-red-400" />
                  <div>
                    <p className="font-bold text-red-200">Cảnh báo rủi ro cao!</p>
                    <p className="text-sm text-red-300">Tài khoản nhận nằm trong danh sách đen</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-[#4F6BFF]/10 border border-[#4F6BFF]/30 rounded-2xl">
                  <CheckCircle2 className="w-8 h-8 text-[#4F6BFF]" />
                  <div>
                    <p className="font-bold text-[#4F6BFF]">Giao dịch an toàn</p>
                    <p className="text-sm text-slate-300">Người nhận đã được xác minh</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 bg-amber-500/20 border border-amber-500/30 rounded-2xl">
                  <Zap className="w-8 h-8 text-amber-400" />
                  <div>
                    <p className="font-bold text-amber-200">Yêu cầu xác nhận</p>
                    <p className="text-sm text-amber-300">Số tiền lớn hơn bình thường, vui lòng xác nhận</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {managedQuery.data?.length ? (
        <section className="bg-white px-6 py-16 lg:px-12 xl:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div><p className="text-sm font-bold uppercase tracking-widest text-violet-600">Từ đội ngũ Timi</p><h2 className="mt-3 text-3xl font-bold text-slate-950">Cập nhật mới nhất</h2></div>
              <Link to="/services" className="inline-flex items-center gap-2 text-sm font-bold text-blue-600">Xem dịch vụ <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {managedQuery.data.slice(0, 3).map((item) => <article key={item.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">{item.image_url && <img src={item.image_url} alt={item.title || "Nội dung Timi"} className="h-40 w-full object-contain" />}<div className="p-5"><h3 className="font-bold text-slate-900">{item.title || "Thông tin từ Timi"}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{item.body}</p></div></article>)}
            </div>
          </div>
        </section>
      ) : null}

      {/* ===================== FEATURES lưới nhỏ (giữ) ===================== */}
      <section id="features" className="py-20 bg-white w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="rounded-3xl p-8 border border-slate-100 hover:border-[#4F6BFF] hover:shadow-lg transition-all">
                <div className="w-14 h-14 bg-gradient-to-br from-[#4F6BFF] to-[#6C4CE0] rounded-2xl flex items-center justify-center mb-6 shadow-md shadow-[#4F6BFF]/20">
                  <f.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3">{f.title}</h3>
                <p className="text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== GET THE APP (ảnh 3) ===================== */}
      <section id="app" className="w-full relative overflow-hidden py-24">
        {/* nền gradient trừu tượng thay cho ảnh chụp, tránh phụ thuộc link ngoài */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#3D5AFB] via-[#5B4FE0] to-[#6C4CE0]" />
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -right-10 w-96 h-96 bg-[#6C4CE0]/40 rounded-full blur-3xl" />

        <div className="relative w-full px-6 lg:px-12 xl:px-20">
          <div className="bg-white rounded-[2.5rem] shadow-2xl px-8 py-16 max-w-2xl mx-auto text-center">
            <div className="mb-6 flex flex-col items-center justify-center gap-2 text-sm text-slate-500 sm:flex-row sm:gap-4">
              <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-[#4F6BFF] text-[#4F6BFF]" /> 4.8 trên App Store</span>
              <span className="flex items-center gap-1"><Star className="w-4 h-4 fill-[#4F6BFF] text-[#4F6BFF]" /> 4.8 trên Google Play</span>
            </div>

            <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0B0B0B] leading-tight mb-8">
              TẢI APP QUẢN LÝ<br />TIỀN MỌI LÚC MỌI NƠI
            </h2>

            <div className="flex flex-col items-center gap-6">
              {/* Khung QR trang trí — thay bằng mã QR thật trỏ tới link tải app */}
              <div className="w-32 h-32 border border-slate-200 rounded-xl p-2 grid grid-cols-6 grid-rows-6 gap-0.5">
                {Array.from({ length: 36 }).map((_, i) => (
                  <div key={i} className={`${(i * 7) % 5 === 0 ? "bg-[#0B0B0B]" : "bg-transparent"} rounded-sm`} />
                ))}
              </div>
              <p className="text-sm text-slate-500">Quét mã để tải Timi</p>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link to="/download" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B0B0B] px-6 py-3 font-semibold text-white transition-colors hover:bg-slate-800 sm:w-auto">
                  <Smartphone className="w-5 h-5" /> App Store
                </Link>
                <Link to="/download" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B0B0B] px-6 py-3 font-semibold text-white transition-colors hover:bg-slate-800 sm:w-auto">
                  <Smartphone className="w-5 h-5" /> Google Play
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== VIDEO (mục mới theo yêu cầu) ===================== */}
      <section className="py-20 bg-[#0B0B0B] w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20 text-center">
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-white mb-4">
            XEM TIMI HOẠT ĐỘNG
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto mb-10">
            Xem AI Anti-Scam phân tích và cảnh báo một giao dịch có dấu hiệu lừa đảo.
          </p>

          <div className="relative max-w-3xl mx-auto rounded-[2rem] overflow-hidden group cursor-pointer">
            <div className="aspect-video bg-gradient-to-br from-[#3D5AFB] to-[#6C4CE0] flex items-center justify-center">
              <Link to="/demo" aria-label="Xem demo Timi Guard" className="flex h-20 w-20 items-center justify-center rounded-full bg-white transition-transform group-hover:scale-110">
                <Play className="w-8 h-8 text-[#4F6BFF] ml-1" fill="currentColor" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== CTA cuối ===================== */}
      <section className="py-20 bg-[#F3F5FF] w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20 text-center">
          <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0B0B0B] mb-6">
            Sẵn sàng bảo vệ ví tiền của bạn?
          </h2>
          <p className="text-lg text-slate-600 mb-10 max-w-2xl mx-auto">
            Tạo tài khoản để trải nghiệm luồng kiểm tra rủi ro và chuyển tiền nội bộ Timi.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => navigate("/register")} className="px-10 py-4 bg-[#4F6BFF] text-white font-bold rounded-2xl hover:bg-[#3D53E8] hover:scale-105 transition-all">
              Tạo tài khoản thử nghiệm
            </button>
            <button onClick={() => navigate("/login")} className="px-10 py-4 bg-white text-[#0B0B0B] font-bold rounded-2xl border border-slate-200 hover:border-[#4F6BFF] transition-all">
              Đã có tài khoản? Đăng nhập
            </button>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="w-full overflow-hidden bg-[#0B0B0B] py-8 text-slate-400 sm:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20">
          <div className="mb-6 grid grid-cols-2 gap-x-5 gap-y-6 sm:gap-8 md:mb-8 md:grid-cols-5">
            <div className="col-span-2 min-w-0 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <TimiLogo className="h-full w-full rounded-xl" />
                </div>
                <span className="font-display text-2xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Timi</span>
              </div>
              <p className="max-w-sm text-xs leading-5 sm:text-sm sm:leading-relaxed">
                Ví điện tử thử nghiệm có lớp phân tích rủi ro AI, giúp bạn kiểm tra dấu hiệu bất thường trước khi quyết định.
              </p>
            </div>
            <div className="min-w-0">
              <h4 className="mb-3 text-sm font-semibold text-white sm:mb-4">Dịch vụ</h4>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-2 sm:text-sm">
                <li><Link to="/services#transfer" className="hover:text-[#4F6BFF] transition-colors">Chuyển tiền</Link></li>
                <li><Link to="/services#bill-payment" className="hover:text-[#4F6BFF] transition-colors">Thanh toán hóa đơn</Link></li>
                <li><Link to="/services#mobile-topup" className="hover:text-[#4F6BFF] transition-colors">Nạp điện thoại</Link></li>
                <li><Link to="/services#spending" className="hover:text-[#4F6BFF] transition-colors">Quản lý chi tiêu</Link></li>
              </ul>
            </div>
            <div className="min-w-0">
              <h4 className="mb-3 text-sm font-semibold text-white sm:mb-4">Khám phá</h4>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-2 sm:text-sm">
                <li><Link to="/demo" className="hover:text-[#4F6BFF] transition-colors">Demo AI Anti-Scam</Link></li>
                <li><Link to="/mission" className="hover:text-[#4F6BFF] transition-colors">Sứ mệnh Timi</Link></li>
                <li><Link to="/download" className="hover:text-[#4F6BFF] transition-colors">Tải ứng dụng</Link></li>
              </ul>
            </div>
            <div className="col-span-2 min-w-0 md:col-span-1">
              <h4 className="mb-3 text-sm font-semibold text-white sm:mb-4">Hỗ trợ</h4>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-2 sm:text-sm">
                <li><Link to="/help" className="hover:text-[#4F6BFF] transition-colors">Trung tâm trợ giúp</Link></li>
                <li><Link to="/privacy" className="hover:text-[#4F6BFF] transition-colors">Chính sách bảo mật</Link></li>
                <li><Link to="/terms" className="hover:text-[#4F6BFF] transition-colors">Điều khoản sử dụng</Link></li>
                <li><Link to="/help" className="hover:text-[#4F6BFF] transition-colors">Trợ giúp - liên hệ</Link></li>
                <li><Link to="/cookies" className="hover:text-[#4F6BFF] transition-colors">Chính sách Cookie</Link></li>
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
