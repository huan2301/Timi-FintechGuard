import { useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import {
  Shield,
  ArrowRight,
  TrendingUp,
  Landmark,
  PiggyBank,
  FileText,
  AlertTriangle,
  Target,
  CheckCircle2,
  Star,
  Mail,
  Phone,
  MapPin,
  Facebook,
  Twitter,
  Linkedin,
  Instagram,
} from "lucide-react";
import { useState, useEffect, useRef, type FormEvent } from "react";
import axiosInstance from "@/services/api/axios";

const stats = [
  { value: "4,2T+", label: "Tài sản quản lý" },
  { value: "97%", label: "Khách hàng hài lòng" },
  { value: "12+", label: "Năm kinh nghiệm" },
  { value: "+18,4%", label: "Tăng trưởng hằng năm" },
];

const trustBadges = [
  "Bảo mật cấp ngân hàng",
  "Xác thực nhiều lớp",
  "50.000+ khách hàng",
  "Mã hóa 256-bit",
  "Tư vấn tài chính thông minh",
  "Phục vụ trên 30 quốc gia",
];

const services = [
  {
    icon: TrendingUp,
    title: "Lập kế hoạch tài chính",
    desc: "Xây dựng kế hoạch chuyển tiền và quản lý chi tiêu theo mục tiêu của bạn.",
    path: "/transfer",
    color: "bg-blue-50 text-blue-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/1.jpg",
  },
  {
    icon: Landmark,
    title: "Quản lý tài chính",
    desc: "Theo dõi số dư, giao dịch và thói quen chi tiêu trong một giao diện thống nhất.",
    path: "/dashboard",
    color: "bg-emerald-50 text-emerald-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/2.jpg",
  },
  {
    icon: PiggyBank,
    title: "Mục tiêu tiết kiệm",
    desc: "Đặt mục tiêu và theo dõi tiến độ tiết kiệm cho những kế hoạch sắp tới.",
    path: "/me",
    color: "bg-amber-50 text-amber-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/3.jpg",
  },
  {
    icon: FileText,
    title: "Báo cáo giao dịch",
    desc: "Xem lại lịch sử giao dịch và kiểm tra các khoản thu chi một cách rõ ràng.",
    path: "/history",
    color: "bg-violet-50 text-violet-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/4.jpg",
  },
  {
    icon: AlertTriangle,
    title: "Bảo vệ giao dịch",
    desc: "AI Anti-Scam hỗ trợ nhận diện và cảnh báo các giao dịch có rủi ro.",
    path: "/transfer",
    color: "bg-rose-50 text-rose-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/5.jpg",
  },
  {
    icon: Target,
    title: "Thanh toán QR",
    desc: "Thanh toán nhanh chóng bằng mã QR ngay trên tài khoản Timi của bạn.",
    path: "/qr",
    color: "bg-sky-50 text-sky-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/6.jpg",
  },
];

const whyFeatures = [
  {
    title: "Trải nghiệm cá nhân hóa",
    desc: "Mỗi tính năng được thiết kế theo nhu cầu và tình hình tài chính riêng của bạn.",
  },
  {
    title: "Minh bạch và rõ ràng",
    desc: "Thông tin giao dịch dễ kiểm tra, không che giấu chi phí hay điều kiện sử dụng.",
  },
  {
    title: "Hỗ trợ 24/7",
    desc: "Đội ngũ hỗ trợ luôn sẵn sàng đồng hành khi bạn cần trợ giúp.",
  },
];

const counterStats = [
  { value: 50000, suffix: "+", label: "Khách hàng tin dùng" },
  { value: 4.2, suffix: "T+", label: "Tài sản được quản lý", isFloat: true },
  { value: 30, suffix: "+", label: "Quốc gia phục vụ" },
  { value: 25, suffix: "", label: "Giải thưởng đạt được" },
];

const testimonials = [
  {
    text: "Timi giúp tôi quản lý tài chính dễ dàng hơn. Tôi luôn biết tiền của mình đang được sử dụng như thế nào.",
    author: "Minh Anh",
    role: "Chủ doanh nghiệp",
    rating: 5,
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/26.jpg",
  },
  {
    text: "Tính năng cảnh báo giao dịch giúp tôi yên tâm hơn trước những khoản chuyển tiền đáng ngờ.",
    author: "Quốc Huy",
    role: "Nhân viên văn phòng",
    rating: 5,
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/33.jpg",
  },
  {
    text: "Lịch sử giao dịch rõ ràng, thanh toán QR nhanh và giao diện rất dễ sử dụng.",
    author: "Thu Trang",
    role: "Nhà sáng lập startup",
    rating: 5,
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/32.jpg",
  },
];

function AnimatedCounter({ target, suffix, isFloat = false, duration = 2000 }: { target: number; suffix: string; isFloat?: boolean; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const startTime = Date.now();
          const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            setCount(isFloat ? parseFloat((target * easeOut).toFixed(1)) : Math.floor(target * easeOut));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration, isFloat]);

  return (
    <div ref={ref} className="text-4xl lg:text-5xl font-bold text-slate-900">
      {isFloat ? count.toFixed(1) : count.toLocaleString()}{suffix}
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);
  const [newsletterError, setNewsletterError] = useState<string | null>(null);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  const handleNewsletterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNewsletterStatus(null);
    setNewsletterError(null);
    setNewsletterSubmitting(true);
    try {
      const { data } = await axiosInstance.post<{ message: string }>(
        "/v1/newsletter/subscribe",
        { email: newsletterEmail },
      );
      setNewsletterStatus(data.message);
      setNewsletterEmail("");
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      setNewsletterError(typeof detail === "string" ? detail : "Không thể đăng ký nhận tin lúc này.");
    } finally {
      setNewsletterSubmitting(false);
    }
  };
  const { user } = useAuthStore();

  return (
    <div className="min-h-screen bg-white w-full font-sans">
      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[100dvh] flex items-center bg-gradient-to-br from-slate-50 via-white to-blue-50/30 w-full overflow-hidden">
        {/* Background decoration */}
        <div className="absolute top-20 right-0 w-[600px] h-[600px] bg-blue-100/40 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-100/30 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />

        <div className="w-full px-6 lg:px-12 xl:px-20 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left Content */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-100 rounded-full mb-6">
                <Star className="w-4 h-4 text-blue-600 fill-blue-600" />
                <span className="text-sm font-semibold text-blue-700">Được tin dùng từ 2012 · 50.000+ khách hàng</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-slate-900 leading-[1.1] mb-6">
                Quản lý tài chính{" "}
                <span className="relative">
                  thật an tâm
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none">
                    <path d="M2 10C50 2 100 2 150 6C200 10 250 10 298 2" stroke="#3B82F6" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="text-lg lg:text-xl text-slate-500 leading-relaxed mb-8 max-w-lg">
                Timi mang đến công cụ tài chính thông minh, giúp bạn chuyển tiền, thanh toán và bảo vệ mọi giao dịch mỗi ngày.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <button
                  onClick={() => navigate(user ? "/dashboard" : "/register")}
                  className="px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2 group"
                >
                  Bắt đầu ngay
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <button
                  onClick={() => navigate("/transfer")}
                  className="px-8 py-4 bg-white text-slate-700 font-bold rounded-2xl border-2 border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                >
                  Chuyển tiền
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>

              {/* Hero Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-2xl lg:text-3xl font-bold text-slate-900">{stat.value}</p>
                    <p className="text-xs text-slate-400 mt-1 font-medium uppercase tracking-wider">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Image */}
            <div className="relative hidden lg:block">
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50 border border-slate-100">
                <img
                  src="https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=800&q=80"
                  alt="Financial Planning"
                  className="w-full h-[560px] object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/20 to-transparent" />
              </div>

              {/* Floating Card */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-5 w-64">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium">Tăng trưởng tài chính</p>
                    <p className="text-lg font-bold text-slate-900">+22.4%</p>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full w-3/4 bg-emerald-500 rounded-full" />
                </div>
              </div>

              {/* Floating Card 2 */}
              <div className="absolute -top-4 -right-4 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Được AI bảo vệ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===== TRUST MARQUEE ===== */}
      <section className="py-6 bg-slate-900 w-full overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...trustBadges, ...trustBadges, ...trustBadges].map((badge, i) => (
            <span key={i} className="mx-8 text-sm font-medium text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              {badge}
            </span>
          ))}
        </div>
      </section>

      {/* ===== SERVICES SECTION ===== */}
      <section className="py-24 bg-white w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Dịch vụ của Timi</p>
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 mb-5">Giải pháp tài chính toàn diện</h2>
            <p className="text-slate-500 text-lg">
              Từ chuyển tiền, thanh toán đến bảo vệ tài khoản, Timi cung cấp các công cụ cần thiết cho nhu cầu tài chính của bạn.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <div
                  key={service.title}
                  onClick={() => user ? navigate(service.path) : navigate("/login")}
                  className="group bg-white rounded-3xl overflow-hidden border border-slate-100 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-100/50 transition-all duration-500 cursor-pointer"
                >
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={service.image}
                      alt={service.title}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                    <div className={`absolute bottom-4 left-4 w-12 h-12 ${service.color} rounded-xl flex items-center justify-center shadow-lg`}>
                      <Icon className="w-6 h-6" />
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{service.title}</h3>
                    <p className="text-slate-500 leading-relaxed mb-4">{service.desc}</p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 group-hover:gap-3 transition-all">
                      Xem chi tiết <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ===== WHY CHOOSE US ===== */}
      <section className="py-24 bg-slate-50/50 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            {/* Left Image */}
            <div className="relative">
              <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50">
                <img
                  src="https://images.unsplash.com/photo-1553877522-43269d4ea984?w=800&q=80"
                  alt="Why Choose Us"
                  className="w-full h-[500px] object-cover"
                />
              </div>
              <div className="absolute -bottom-8 -right-8 bg-white rounded-2xl shadow-xl p-6 border border-slate-100 max-w-xs">
                <div className="flex items-center gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-slate-600 font-medium">"Nền tảng tài chính dễ dùng và an toàn."</p>
                <p className="text-xs text-slate-400 mt-2">— 50.000+ đánh giá đã xác thực</p>
              </div>
            </div>

            {/* Right Content */}
            <div>
              <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Vì sao chọn Timi</p>
              <h2 className="text-3xl lg:text-5xl font-bold text-slate-900 mb-6 leading-tight">
                Quản lý tiền thông minh hơn mỗi ngày
              </h2>
              <p className="text-slate-500 text-lg leading-relaxed mb-10">
                Timi kết hợp công nghệ hiện đại với các lớp bảo vệ an toàn để giúp bạn chủ động quản lý tài chính, luôn đặt quyền lợi của bạn lên hàng đầu.
              </p>

              <div className="space-y-6">
                {whyFeatures.map((feature, idx) => (
                  <div key={idx} className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="text-lg font-bold text-slate-900 mb-1">{feature.title}</h4>
                      <p className="text-slate-500">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => navigate("/dashboard")}
                className="mt-10 px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-200 flex items-center gap-2 group"
              >
                Khám phá Timi
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== COUNTER STATS ===== */}
      <section className="py-20 bg-slate-900 text-white w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="text-center mb-16">
            <p className="text-sm font-bold text-blue-400 uppercase tracking-widest mb-3">Timi đã tạo ra khác biệt</p>
            <h2 className="text-3xl lg:text-5xl font-bold mb-4">Hơn 12 năm đồng hành cùng khách hàng</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
            {counterStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} isFloat={stat.isFloat} />
                <p className="mt-3 text-slate-400 font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="py-24 bg-white w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="text-center mb-16">
            <p className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Khách hàng nói gì</p>
            <h2 className="text-3xl lg:text-5xl font-bold text-slate-900">Trải nghiệm từ người dùng Timi</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <div
                key={i}
                className="bg-slate-50 rounded-3xl p-8 border border-slate-100 hover:shadow-xl hover:shadow-slate-100 transition-all duration-300"
              >
                <div className="flex gap-1 mb-5">
                  {[...Array(t.rating)].map((_, j) => (
                    <Star key={j} className="w-5 h-5 text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-slate-600 leading-relaxed mb-6 text-lg">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <img
                    src={t.image}
                    alt={t.author}
                    className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-md"
                  />
                  <div>
                    <p className="font-bold text-slate-900">{t.author}</p>
                    <p className="text-sm text-slate-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== NEWSLETTER / CTA ===== */}
      <section className="py-24 bg-gradient-to-br from-blue-600 to-indigo-700 w-full relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
        <div className="w-full px-6 lg:px-12 xl:px-20 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl lg:text-5xl font-bold text-white mb-6">
              Nhận thông tin tài chính hữu ích
            </h2>
            <p className="text-blue-100 text-lg mb-10">
              Đăng ký để nhận mẹo quản lý tài chính và thông tin mới nhất từ Timi.
            </p>
            <form onSubmit={handleNewsletterSubmit} className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
              <div className="flex-1 relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={newsletterEmail}
                  onChange={(event) => setNewsletterEmail(event.target.value)}
                  required
                  placeholder="Nhập email của bạn"
                  className="w-full pl-12 pr-4 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-blue-200 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
              <button type="submit" disabled={newsletterSubmitting} className="px-8 py-4 bg-white text-blue-700 font-bold rounded-2xl hover:bg-blue-50 transition-all shadow-lg disabled:cursor-not-allowed disabled:opacity-70">
                {newsletterSubmitting ? "Đang đăng ký..." : "Đăng ký nhận tin"}
              </button>
            </form>
            {newsletterStatus && <p className="mt-4 text-sm font-medium text-emerald-200">{newsletterStatus}</p>}
            {newsletterError && <p className="mt-4 text-sm font-medium text-rose-200">{newsletterError}</p>}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-slate-950 text-slate-400 py-16 w-full">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-12 mb-12">
            {/* Brand */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-9 h-9 rounded-xl overflow-hidden">
                  <img src="/logo.png" alt="Timi" className="h-full w-full object-cover" />
                </div>
                <span className="font-display text-2xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Timi</span>
              </div>
              <p className="text-sm leading-relaxed max-w-sm mb-6">
                Nền tảng tài chính thông minh được AI bảo vệ. Sứ mệnh của Timi là giúp mọi giao dịch của bạn an toàn hơn.
              </p>
              <div className="flex gap-3">
                {[Facebook, Twitter, Linkedin, Instagram].map((Icon, i) => (
                  <button key={i} className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center hover:bg-blue-600 hover:text-white transition-all">
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>

            {/* Links */}
            <div>
              <h4 className="text-white font-semibold mb-5">Dịch vụ</h4>
              <ul className="space-y-3 text-sm">
                <li><button onClick={() => navigate("/transfer")} className="hover:text-blue-400 transition-colors">Chuyển tiền</button></li>
                <li><button onClick={() => navigate("/qr")} className="hover:text-blue-400 transition-colors">Thanh toán QR</button></li>
                <li><button onClick={() => navigate("/history")} className="hover:text-blue-400 transition-colors">Lịch sử giao dịch</button></li>
                <li><button onClick={() => navigate("/me")} className="hover:text-blue-400 transition-colors">Quản lý tài khoản</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-5">Timi</h4>
              <ul className="space-y-3 text-sm">
                <li><button onClick={() => navigate("/dashboard")} className="hover:text-blue-400 transition-colors">Tổng quan</button></li>
                <li><button onClick={() => navigate("/me")} className="hover:text-blue-400 transition-colors">Tài khoản</button></li>
                <li><button onClick={() => navigate("/history")} className="hover:text-blue-400 transition-colors">Lịch sử hoạt động</button></li>
                <li><button onClick={() => navigate("/setup-face")} className="hover:text-blue-400 transition-colors">Bảo mật khuôn mặt</button></li>
              </ul>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-5">Liên hệ</h4>
              <ul className="space-y-3 text-sm">
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4" /> support@timi.com
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4" /> 1900 1234
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> TP. Hà Nội
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-900 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm">© 2026 Timi. Bảo lưu mọi quyền.</p>
            <div className="flex gap-6 text-sm">
              <button onClick={() => navigate("/help")} className="hover:text-blue-400 transition-colors">Help Center</button>
              <button onClick={() => navigate("/privacy")} className="hover:text-blue-400 transition-colors">Chính sách bảo mật</button>
              <button onClick={() => navigate("/terms")} className="hover:text-blue-400 transition-colors">Điều khoản sử dụng</button>
              <a href="#" className="hover:text-blue-400 transition-colors">Cookie</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Marquee animation style */}
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.33%); }
        }
        .animate-marquee {
          animation: marquee 20s linear infinite;
        }
      `}</style>
    </div>
  );
}
