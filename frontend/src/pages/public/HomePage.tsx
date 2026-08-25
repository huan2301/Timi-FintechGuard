import { Link, useNavigate } from "react-router-dom";
import {
  Shield,
  ArrowRight,
  ArrowLeft,
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
import TimiLogo from "@/components/brand/TimiLogo";
import { useAuthStore } from "@/stores/authStore";

/* ------------------------------------------------------------------ */
/*  Nội dung                                                          */
/* ------------------------------------------------------------------ */

const trustRow = [
  { icon: Users, title: "Hàng triệu người tin dùng", desc: "Timi xử lý hàng trăm ngàn giao dịch mỗi ngày trên khắp Việt Nam", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/41.jpg" },
  { icon: Star, title: "Đánh giá 4.8/5 sao", desc: "Từ hơn 200.000 lượt đánh giá của người dùng trên App Store & Google Play", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/42.jpg" },
  { icon: Headphones, title: "Hỗ trợ 24/7", desc: "Đội ngũ chuyên gia sẵn sàng hỗ trợ bạn mọi lúc qua chat, điện thoại", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/43.png" },
];

const protectionRow = [
  { icon: ShieldCheck, title: "Đội ngũ chống lừa đảo AI", desc: "Giám sát và phân tích rủi ro theo thời gian thực", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/44.png" },
  { icon: KeyRound, title: "Xác thực 2 lớp", desc: "Bảo vệ tài khoản bằng sinh trắc học và OTP", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/45.jpg" },
  { icon: Building2, title: "Hợp tác cùng tổ chức uy tín", desc: "Liên kết dữ liệu cảnh báo với ngân hàng và cơ quan an ninh mạng", image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/46.jpg" },
];

const testimonials = [
  {
    flag: "🇻🇳",
    quote:
      "Timi giúp mình chuyển tiền cho gia đình ở quê chỉ trong vài giây, lại còn cảnh báo trước khi mình chuyển nhầm vào tài khoản lừa đảo.",
    name: "Minh Anh",
    theme: "light",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/41.jpg",
  },
  {
    flag: "🇻🇳",
    quote:
      "Ứng dụng quản lý chi tiêu tự động, mình tiết kiệm được rõ rệt sau 3 tháng dùng Timi.",
    name: "Quốc Huy",
    theme: "dark",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/42.jpg",
  },
  {
    flag: "🇻🇳",
    quote:
      "Cảnh báo AI Anti-Scam đã chặn một giao dịch mình suýt bị lừa. Cảm giác an tâm hơn hẳn.",
    name: "Thu Trang",
    theme: "light",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/43.png",
  },
];

const features = [
  {
    icon: ArrowRight,
    title: "Chuyển tiền siêu tốc",
    desc: "Chuyển tiền 24/7 đến mọi ngân hàng, chỉ cần số điện thoại",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/32.jpg",
  },
  {
    icon: CreditCard,
    title: "Thanh toán mọi dịch vụ",
    desc: "Hóa đơn điện nước, nạp điện thoại, vé xem phim... tất cả trong 1 chạm",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/32.jpg",
  },
  {
    icon: Shield,
    title: "AI Anti-Scam",
    desc: "Trí tuệ nhân tạo phân tích real-time, chặn giao dịch rủi ro trước khi xảy ra",
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
  const [, setSlide] = useState(0);
  const [activeBanner, setActiveBanner] = useState(0);

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

  return (
    <div className="min-h-screen bg-white w-full font-[Inter]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
      `}</style>

      {/* ============================= NAV ============================= */}
      <nav className="sticky top-0 z-50 bg-white border-b border-slate-100 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                <TimiLogo className="h-full w-full rounded-xl" />
              </div>
              <span className="font-display text-2xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Timi</span>
            </div>

            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-slate-700 hover:text-[#4F6BFF] font-medium transition-colors">Dịch vụ</a>
              <Link to="/terms" className="text-slate-700 hover:text-[#4F6BFF] font-medium transition-colors">Điều khoản</Link>
              {/* <a href="#security" className="text-slate-700 hover:text-[#4F6BFF] font-medium transition-colors">Bảo mật</a> */}
              <Link to="/privacy" className="text-slate-700 hover:text-[#4F6BFF] font-medium transition-colors">Bảo mật dữ liệu</Link>
              <Link to="/mission" className="text-slate-700 hover:text-[#4F6BFF] font-medium transition-colors">Sứ mệnh</Link>
              <a href="#app" className="text-slate-700 hover:text-[#4F6BFF] font-medium transition-colors">Tải app</a>
            </div>

            <div className="hidden md:flex items-center gap-2">
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
                  <button onClick={() => navigate("/login")} className="px-5 py-2 text-[#0B0B0B] font-semibold hover:bg-slate-50 rounded-full transition-colors">
                    Đăng nhập
                  </button>
                  <button onClick={() => navigate("/register")} className="px-5 py-2.5 bg-[#4F6BFF] text-white font-bold rounded-full hover:bg-[#3D53E8] transition-colors">
                    Đăng ký
                  </button>
                </>
              )}
            </div>

            <button className="md:hidden p-2 text-slate-700" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-3">
            <a href="#features" className="block py-2 text-slate-700 font-medium">Dịch vụ</a>
            <a href="#security" className="block py-2 text-slate-700 font-medium">Bảo mật</a>
            <a href="#app" className="block py-2 text-slate-700 font-medium">Tải app</a>
            <Link to="/mission" className="block py-2 text-slate-700 font-medium">Sứ mệnh</Link>
            <Link to="/terms" className="block py-2 text-slate-700 font-medium">Điều khoản</Link>
            <Link to="/privacy" className="block py-2 text-slate-700 font-medium">Bảo mật dữ liệu</Link>
            <hr className="border-slate-100" />
            {isAuthenticated ? (
              <>
                <button onClick={() => navigate("/dashboard")} className="flex w-full items-center gap-2 py-2 text-left font-semibold text-slate-700">
                  <UserIcon className="h-4 w-4 text-violet-600" />
                  <span className="truncate">{displayName}</span>
                </button>
                <button onClick={() => void handleLogout()} className="flex w-full items-center gap-2 rounded-full py-2.5 text-left font-semibold text-rose-600">
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate("/login")} className="block w-full text-left py-2 text-[#0B0B0B] font-semibold">Đăng nhập</button>
                <button onClick={() => navigate("/register")} className="w-full py-2.5 bg-[#4F6BFF] text-white font-bold rounded-full">Đăng ký</button>
              </>
            )}
          </div>
        )}
      </nav>

      {/* ============================= HERO ============================= */}
      <section className="w-full bg-white">
        <div className="w-full px-6 lg:px-12 xl:px-20 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <h1 className="font-display text-5xl lg:text-7xl font-bold text-[#0B0B0B] leading-[1.02] tracking-tight">
                GIỮ TIỀN AN TOÀN.<br />CHI TIÊU DỄ DÀNG.
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed max-w-md">
                Timi là ví điện tử được bảo vệ bởi AI Anti-Scam — chuyển tiền, thanh toán và quản lý tài chính, tất cả trong một chạm.
              </p>
              <button onClick={() => navigate("/register")} className="px-8 py-4 bg-[#4F6BFF] text-white font-bold rounded-2xl hover:bg-[#3D53E8] hover:scale-[1.02] transition-all inline-flex items-center gap-2">
                Mở tài khoản miễn phí
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
                Mỗi tháng, hệ thống AI Anti-Scam của Timi quét hàng triệu giao dịch để giữ an toàn cho tiền của bạn.
              </p>
              <button className="text-[#4F6BFF] font-bold underline underline-offset-4 hover:text-[#4F6BFF] transition-colors">
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

      {/* ===================== TESTIMONIALS (xanh) ===================== */}
      <section className="w-full bg-[#F3F5FF]">
        <div className="w-full px-6 lg:px-12 xl:px-20 py-16 lg:py-20">
          <div className="flex items-center justify-between mb-10">
            <h2 className="font-display text-3xl lg:text-5xl font-bold text-[#0B0B0B] leading-tight">
              DÀNH CHO NGƯỜI<br />DÙNG THÔNG MINH
            </h2>
            <div className="hidden sm:flex items-center gap-3">
              <button
                onClick={() => setSlide((s) => Math.max(0, s - 1))}
                className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center hover:bg-slate-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => setSlide((s) => Math.min(testimonials.length - 1, s + 1))}
                className="w-10 h-10 rounded-full bg-[#4F6BFF] flex items-center justify-center hover:bg-[#3D53E8] transition-colors"
              >
                <ArrowRight className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
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
                  {t.name} · Người dùng Timi
                </div>
              </div>
            ))}
          </div>

          {/* MEET MONEY WITHOUT BORDERS -> Tiền bạc không còn giới hạn */}
          <div className="mt-16 bg-gradient-to-br from-[#3D5AFB] to-[#6C4CE0] rounded-[2.5rem] px-8 py-16 lg:py-24 flex flex-col items-center text-center relative overflow-hidden">
            {/* Khung placeholder cho ảnh trái đất của bạn */}
            <div className="mb-8 w-40 h-40 flex items-center justify-center">
              <img src="https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/plant.png" alt="Timi" className="w-full h-full object-contain" />
            </div>
            <h2 className="font-display text-3xl lg:text-5xl font-bold text-white leading-tight max-w-2xl">
              TIỀN BẠC KHÔNG<br />CÒN GIỚI HẠN
            </h2>
            <p className="text-slate-300 mt-4 max-w-xl">
              Chúng tôi xây dựng cách tốt nhất để quản lý và bảo vệ tiền của bạn. Ít phí. Nhiều an tâm. Tốc độ tối đa.
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
                <span className="text-sm font-medium">Công nghệ độc quyền</span>
              </div>

              <h2 className="font-display text-3xl lg:text-5xl font-bold leading-tight">
                AI Anti-Scam Agent<br />
                <span className="text-[#4F6BFF]">bảo vệ 24/7</span>
              </h2>

              <p className="text-slate-300 text-lg leading-relaxed">
                Hệ thống AI của Timi phân tích hành vi giao dịch, nhận diện mẫu lừa đảo và cảnh báo ngay lập tức trước khi tiền của bạn rời khỏi ví.
              </p>

              <div className="space-y-4 pt-4">
                {[
                  "Phát hiện giao dịch bất thường trong 50ms",
                  "Cơ sở dữ liệu scam cập nhật real-time",
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
            <div className="flex items-center justify-center gap-4 mb-6 text-sm text-slate-500">
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

              <div className="flex gap-3">
                <button className="px-6 py-3 bg-[#0B0B0B] text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-800 transition-colors">
                  <Smartphone className="w-5 h-5" /> App Store
                </button>
                <button className="px-6 py-3 bg-[#0B0B0B] text-white rounded-xl font-semibold flex items-center gap-2 hover:bg-slate-800 transition-colors">
                  <Smartphone className="w-5 h-5" /> Google Play
                </button>
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
            60 giây để thấy AI Anti-Scam chặn một giao dịch lừa đảo theo thời gian thực.
          </p>

          <div className="relative max-w-3xl mx-auto rounded-[2rem] overflow-hidden group cursor-pointer">
            {/* Thay src bên dưới bằng video thật của bạn; ảnh nền chỉ là placeholder trang trí */}
            <div className="aspect-video bg-gradient-to-br from-[#3D5AFB] to-[#6C4CE0] flex items-center justify-center">
              <button className="w-20 h-20 rounded-full bg-white flex items-center justify-center group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 text-[#4F6BFF] ml-1" fill="currentColor" />
              </button>
            </div>
            {/* <video className="absolute inset-0 w-full h-full object-cover" controls poster="/assets/video-poster.jpg" src="/assets/timi-demo.mp4" /> */}
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
            Tham gia cùng hàng triệu người dùng đang được Timi bảo vệ mỗi ngày. Đăng ký miễn phí, chỉ mất 30 giây.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={() => navigate("/register")} className="px-10 py-4 bg-[#4F6BFF] text-white font-bold rounded-2xl hover:bg-[#3D53E8] hover:scale-105 transition-all">
              Tạo tài khoản miễn phí
            </button>
            <button onClick={() => navigate("/login")} className="px-10 py-4 bg-white text-[#0B0B0B] font-bold rounded-2xl border border-slate-200 hover:border-[#4F6BFF] transition-all">
              Đã có tài khoản? Đăng nhập
            </button>
          </div>
        </div>
      </section>

      {/* ===================== FOOTER ===================== */}
      <footer className="bg-[#0B0B0B] text-slate-400 py-12 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center">
                  <TimiLogo className="h-full w-full rounded-xl" />
                </div>
                <span className="font-display text-2xl font-bold bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-transparent">Timi</span>
              </div>
              <p className="text-sm leading-relaxed max-w-sm">
                Ví điện tử thông minh được bảo vệ bởi AI. Sứ mệnh của chúng tôi là giúp mọi giao dịch của bạn đều an toàn tuyệt đối.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Dịch vụ</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Chuyển tiền</a></li>
                <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Thanh toán hóa đơn</a></li>
                <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Nạp điện thoại</a></li>
                <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Quản lý chi tiêu</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">Hỗ trợ</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-[#4F6BFF] transition-colors">Trung tâm trợ giúp</a></li>
                <li><Link to="/privacy" className="hover:text-[#4F6BFF] transition-colors">Chính sách bảo mật</Link></li>
                <li><Link to="/terms" className="hover:text-[#4F6BFF] transition-colors">Điều khoản sử dụng</Link></li>
                <li><Link to="/help" className="hover:text-[#4F6BFF] transition-colors">Trợ giúp - liên hệ</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-sm text-center">
            © 2026 Timi. Tất cả quyền được bảo lưu.
          </div>
        </div>
      </footer>
    </div>
  );
}
