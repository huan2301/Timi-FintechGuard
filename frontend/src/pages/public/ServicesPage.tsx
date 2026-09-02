import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  QrCode,
  ReceiptText,
  Send,
  ShieldCheck,
  Smartphone,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

import PublicSiteChrome from "@/components/layout/PublicSiteChrome";
import axiosInstance from "@/services/api/axios";
import { useAuthStore } from "@/stores/authStore";

type ManagedContent = {
  id: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
  content_type: string;
};

type ServiceCard = {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  actionLabel: string;
  tone: string;
};

const serviceCards: ServiceCard[] = [
  {
    id: "transfer",
    icon: Send,
    eyebrow: "01 · Giao dịch",
    title: "Chuyển tiền an tâm",
    description: "Nhập người nhận, kiểm tra thông tin và nhận cảnh báo AI trước khi xác nhận.",
    action: "/transfer",
    actionLabel: "Mở Chuyển tiền",
    tone: "from-blue-600 to-indigo-600",
  },
  {
    id: "bill-payment",
    icon: ReceiptText,
    eyebrow: "02 · Tiện ích",
    title: "Thanh toán hóa đơn",
    description: "Tính năng đang trong lộ trình; hiện chưa tạo hoặc quyết toán hóa đơn thật.",
    action: "/help",
    actionLabel: "Xem trạng thái tính năng",
    tone: "from-emerald-500 to-teal-600",
  },
  {
    id: "mobile-topup",
    icon: Smartphone,
    eyebrow: "03 · Kết nối",
    title: "Nạp điện thoại",
    description: "Tính năng đang trong lộ trình; hiện chưa kết nối nhà mạng hoặc thu tiền thật.",
    action: "/help",
    actionLabel: "Xem trạng thái tính năng",
    tone: "from-fuchsia-500 to-purple-600",
  },
  {
    id: "spending",
    icon: BarChart3,
    eyebrow: "04 · Kiểm soát",
    title: "Quản lý chi tiêu",
    description: "Theo dõi số dư, lịch sử và thói quen sử dụng tiền để chủ động hơn mỗi ngày.",
    action: "/dashboard",
    actionLabel: "Xem Dashboard",
    tone: "from-amber-500 to-orange-600",
  },
  {
    id: "qr-payment",
    icon: QrCode,
    eyebrow: "05 · Thanh toán",
    title: "Thanh toán QR",
    description: "Quét mã để thanh toán hoặc tạo mã nhận tiền với lớp kiểm tra an toàn của Timi.",
    action: "/qr",
    actionLabel: "Mở thanh toán QR",
    tone: "from-sky-500 to-cyan-600",
  },
  {
    id: "protection",
    icon: ShieldCheck,
    eyebrow: "06 · Bảo vệ",
    title: "AI Anti-Scam chủ động",
    description: "Phân tích tín hiệu bất thường, giải thích rủi ro và cho bạn thêm thời gian kiểm tra.",
    action: "/demo",
    actionLabel: "Xem demo bảo vệ",
    tone: "from-slate-800 to-slate-950",
  },
];

export default function ServicesPage() {
  const location = useLocation();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const managedQuery = useQuery({
    queryKey: ["public-content", "services"],
    queryFn: async () => (await axiosInstance.get<ManagedContent[]>("/v1/content/services")).data,
  });

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [location.hash]);

  const destination = (path: string) => (isAuthenticated ? path : "/login");

  return (
    <PublicSiteChrome>
      <main className="w-full bg-white">
        <section className="relative overflow-hidden bg-[#F3F5FF] px-6 py-10 sm:py-12 lg:px-12 xl:px-20">
          <div className="absolute -right-24 -top-40 h-[28rem] w-[28rem] rounded-full bg-violet-300/30 blur-3xl" />
          <div className="absolute -bottom-48 left-1/3 h-[24rem] w-[24rem] rounded-full bg-blue-300/25 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#4F6BFF]">
                <WalletCards className="h-4 w-4" /> Dịch vụ Timi
              </div>
              <h1 className="font-display mt-4 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl">
                Mọi công cụ tài chính, trong một trải nghiệm an tâm.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Timi kết hợp chuyển tiền mô phỏng, tra cứu người nhận, lịch sử giao dịch và phân tích rủi ro để bạn hiểu rõ từng quyết định trong bản demo.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link to={isAuthenticated ? "/dashboard" : "/register"} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#4F6BFF] px-6 py-3.5 font-bold text-white transition hover:bg-[#3D53E8]">
                  Bắt đầu với Timi <ArrowRight className="h-5 w-5" />
                </Link>
                <Link to="/help" className="inline-flex items-center justify-center rounded-2xl border border-blue-200 bg-white/70 px-6 py-3.5 font-semibold text-slate-700 transition hover:bg-white hover:text-[#4F6BFF]">
                  Cần được tư vấn?
                </Link>
              </div>
            </div>
            <div className="rounded-[2rem] border border-white/80 bg-white/75 p-5 shadow-lg shadow-violet-200/40 backdrop-blur-sm sm:p-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Timi Guard</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">Lớp bảo vệ chủ động</p>
                </div>
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600"><ShieldCheck className="h-5 w-5" /></div>
              </div>
              <div className="mt-4 space-y-2.5">
                {["Kiểm tra người nhận", "Phân tích dấu hiệu bất thường", "Xác nhận trước khi chuyển"].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-[#4F6BFF]">0{index + 1}</span>
                    <span className="text-sm font-medium text-slate-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:px-12 xl:px-20">
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">Chọn điều bạn cần</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Một nơi để làm chủ dòng tiền</h2>
            <p className="mt-4 leading-7 text-slate-500">Các mục bên dưới đều có điểm đến rõ ràng. Những luồng giao dịch cần tài khoản sẽ đưa bạn tới đăng nhập trước khi tiếp tục.</p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {serviceCards.map(({ id, icon: Icon, eyebrow, title, description, action, actionLabel, tone }) => (
              <article id={id} key={id} className="group flex min-h-[290px] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-xl hover:shadow-blue-100/50">
                <div className={`bg-gradient-to-br ${tone} p-6 text-white`}>
                  <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-widest text-white/70">{eyebrow}</span><Icon className="h-6 w-6" /></div>
                  <h3 className="mt-8 text-2xl font-bold">{title}</h3>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <p className="leading-7 text-slate-500">{description}</p>
                  <Link to={destination(action)} className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-bold text-blue-600 transition group-hover:gap-3">
                    {actionLabel} <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        {managedQuery.data?.length ? (
          <section className="bg-[#F3F5FF] px-6 py-16 sm:py-20 lg:px-12 xl:px-20">
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                <div><p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-600">Cập nhật từ Timi</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">Nội dung dịch vụ mới nhất</h2></div>
                <span className="text-sm text-slate-500">{managedQuery.data.length} nội dung đang hiển thị</span>
              </div>
              <div className="mt-8 grid gap-5 md:grid-cols-2">
                {managedQuery.data.map((item) => (
                  <article key={item.id} className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
                    {item.image_url && <div className="flex h-48 items-center justify-center overflow-hidden bg-slate-50"><img src={item.image_url} alt={item.title || "Hình ảnh dịch vụ Timi"} className="h-full w-full object-contain" /></div>}
                    <div className="p-6"><span className="text-xs font-bold uppercase tracking-widest text-violet-500">{item.content_type === "review" ? "Góc người dùng" : "Thông tin dịch vụ"}</span><h3 className="mt-2 text-xl font-bold text-slate-900">{item.title || "Dịch vụ Timi"}</h3><p className="mt-3 leading-7 text-slate-600">{item.body || "Tìm hiểu thêm về cách Timi đồng hành cùng bạn."}</p></div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="px-6 py-16 sm:py-20 lg:px-12 xl:px-20">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-7 rounded-[2rem] bg-gradient-to-r from-blue-600 to-violet-600 p-8 text-white shadow-xl shadow-blue-200 sm:p-12 md:flex-row md:items-center">
            <div><h2 className="text-3xl font-bold">Sẵn sàng dùng Timi?</h2><p className="mt-2 max-w-xl leading-7 text-blue-100">Đăng ký tài khoản thử nghiệm để trải nghiệm giao dịch mô phỏng và các lớp bảo vệ thông minh.</p></div>
            <Link to={isAuthenticated ? "/dashboard" : "/register"} className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-white px-6 py-3.5 font-bold text-blue-700 transition hover:bg-blue-50">Tiếp tục <ArrowRight className="h-5 w-5" /></Link>
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
