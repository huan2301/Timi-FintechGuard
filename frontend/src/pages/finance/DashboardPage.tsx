import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Facebook,
  FileText,
  History,
  Instagram,
  Landmark,
  Linkedin,
  Loader2,
  Mail,
  MapPin,
  Phone,
  QrCode,
  RefreshCw,
  Send,
  Shield,
  ShieldCheck,
  Star,
  Twitter,
  WalletCards,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import { authApi } from "@/services/api/auth";
import axiosInstance from "@/services/api/axios";
import { transactionsApi, type Transaction } from "@/services/api/transactions";
import { useAuthStore } from "@/stores/authStore";

type ManagedContent = {
  id: string;
  title: string | null;
  body: string | null;
  image_url: string | null;
};

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const trustBadges = [
  "Sổ cái Timi minh bạch",
  "Xác thực nhiều lớp",
  "Cảnh báo giao dịch rủi ro",
  "PIN giao dịch",
  "Xác minh khuôn mặt",
  "Bạn luôn là người quyết định",
];

const services = [
  {
    icon: Send,
    title: "Chuyển tiền an toàn",
    desc: "Tra cứu người nhận, đánh giá rủi ro và kiểm tra lại trước khi xác nhận giao dịch.",
    path: "/transfer",
    color: "bg-blue-50 text-blue-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/1.jpg",
  },
  {
    icon: Landmark,
    title: "Quản lý tài chính",
    desc: "Theo dõi số dư và hoạt động tài khoản bằng dữ liệu được tải trực tiếp từ Timi.",
    path: "/dashboard",
    color: "bg-emerald-50 text-emerald-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/2.jpg",
  },
  {
    icon: ShieldCheck,
    title: "Thiết lập bảo mật",
    desc: "Quản lý mã PIN, khuôn mặt và các lớp xác minh bảo vệ tài khoản của bạn.",
    path: "/me",
    color: "bg-amber-50 text-amber-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/3.jpg",
  },
  {
    icon: FileText,
    title: "Lịch sử giao dịch",
    desc: "Xem lại tiền vào, tiền ra, trạng thái và cảnh báo của từng giao dịch.",
    path: "/history",
    color: "bg-violet-50 text-violet-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/4.jpg",
  },
  {
    icon: AlertTriangle,
    title: "Bảo vệ chống lừa đảo",
    desc: "Timi phân tích dấu hiệu đáng ngờ và giúp bạn dừng lại trước khi chuyển tiền.",
    path: "/transfer",
    color: "bg-rose-50 text-rose-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/5.jpg",
  },
  {
    icon: QrCode,
    title: "Thanh toán QR",
    desc: "Quét hoặc tạo mã QR để bắt đầu giao dịch nhanh chóng và thuận tiện.",
    path: "/qr",
    color: "bg-sky-50 text-sky-600",
    image: "https://res.cloudinary.com/dduc9plv6/image/upload/fintechguard/frontend/6.jpg",
  },
];

const whyFeatures = [
  {
    title: "Dữ liệu tài khoản thật",
    desc: "Số dư, giao dịch và trạng thái bảo mật trên trang này được lấy trực tiếp từ tài khoản của bạn.",
  },
  {
    title: "Cảnh báo có giải thích",
    desc: "Mỗi cảnh báo rủi ro đều đi kèm lý do để bạn hiểu và tự đưa ra quyết định.",
  },
  {
    title: "Kiểm soát luôn thuộc về bạn",
    desc: "Trợ lý chỉ hướng dẫn và điều hướng; Timi không tự ý thực hiện giao dịch thay bạn.",
  },
];

const quickActions = [
  { label: "Chuyển tiền", path: "/transfer", icon: Send },
  { label: "Thanh toán QR", path: "/qr", icon: QrCode },
  { label: "Xem lịch sử", path: "/history", icon: History },
];

function transactionLabel(transaction: Transaction): string {
  if (transaction.direction === "incoming") return "Tiền vào";
  if (transaction.transaction_status === "completed") return "Đã hoàn tất";
  if (transaction.transaction_status === "cancelled") return "Đã hủy";
  if (transaction.transaction_status === "failed") return "Thất bại";
  return "Đang xử lý";
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);
  const [newsletterError, setNewsletterError] = useState<string | null>(null);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);

  const overview = useQuery({
    queryKey: ["account-overview"],
    queryFn: authApi.overview,
    staleTime: 30_000,
  });
  const history = useQuery({
    queryKey: ["dashboard-recent-transactions"],
    queryFn: () => transactionsApi.getHistory({ limit: 5 }),
    staleTime: 20_000,
  });
  const security = useQuery({
    queryKey: ["transaction-security-summary"],
    queryFn: transactionsApi.getSecuritySummary,
    staleTime: 30_000,
  });
  const managedQuery = useQuery({
    queryKey: ["public-content", "dashboard"],
    queryFn: async () => (
      await axiosInstance.get<ManagedContent[]>("/v1/content/dashboard")
    ).data,
    staleTime: 60_000,
  });

  const recent = history.data?.items ?? [];
  const isRefreshing = overview.isFetching || history.isFetching || security.isFetching;
  const hasAccountError = overview.isError || history.isError;
  const heroStats = [
    { label: "Người dùng Timi", value: security.data ? security.data.total_users.toLocaleString("vi-VN") : "—" },
    { label: "Tổng giao dịch", value: security.data ? security.data.total_transactions.toLocaleString("vi-VN") : "—" },
    { label: "Giá trị đã giao dịch", value: security.data ? currency.format(security.data.total_completed_volume) : "—" },
    { label: "Rủi ro đã chặn / hủy", value: security.data ? security.data.blocked_transactions.toLocaleString("vi-VN") : "—" },
  ];

  const refreshDashboard = async () => {
    await Promise.all([
      overview.refetch(),
      history.refetch(),
      security.refetch(),
      managedQuery.refetch(),
    ]);
  };

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
    } catch (error: unknown) {
      const detail = isAxiosError<{ detail?: unknown }>(error)
        ? error.response?.data?.detail
        : undefined;
      setNewsletterError(typeof detail === "string" ? detail : "Không thể đăng ký nhận tin lúc này.");
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f5f3ff] font-sans">
      {/* Hero giữ nguyên ngôn ngữ thiết kế của dashboard cũ, nhưng dùng dữ liệu tài khoản thật. */}
      <section className="relative flex min-h-[calc(100dvh-4rem)] w-full items-center overflow-hidden bg-gradient-to-br from-[#eef2ff] via-[#f8f7ff] to-[#e8efff]">
        <div className="absolute right-0 top-20 h-[600px] w-[600px] -translate-y-1/2 translate-x-1/3 rounded-full bg-blue-300/30 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[500px] w-[500px] -translate-x-1/4 translate-y-1/3 rounded-full bg-violet-300/25 blur-3xl" />
        <div className="relative z-10 w-full px-6 py-16 lg:px-12 xl:px-20">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2">
                <Star className="h-4 w-4 fill-blue-600 text-blue-600" />
                <span className="text-sm font-semibold text-blue-700">
                  Xin chào, {user?.full_name || "bạn"} · tổng quan toàn hệ thống Timi
                </span>
              </div>
              <h1 className="font-display mb-6 text-4xl font-bold leading-[1.08] text-slate-900 sm:text-5xl lg:text-6xl xl:text-7xl">
                Quản lý tài chính{" "}
                <span className="relative whitespace-nowrap">
                  thật an tâm
                  <svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 300 12" fill="none" aria-hidden="true">
                    <path d="M2 10C50 2 100 2 150 6C200 10 250 10 298 2" stroke="#3B82F6" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>
              <p className="mb-8 max-w-xl text-lg leading-relaxed text-slate-500 lg:text-xl">
                Theo dõi quy mô hoạt động của Timi, đồng thời kiểm tra tài khoản và sử dụng các lớp bảo vệ trong cùng một trải nghiệm quen thuộc.
              </p>
              <div className="mb-12 flex flex-col gap-4 sm:flex-row">
                <button type="button" onClick={() => navigate("/transfer")} className="group flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-xl shadow-slate-200 transition-all hover:bg-slate-800">
                  Chuyển tiền an toàn
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </button>
                <button type="button" onClick={() => navigate("/qr")} className="flex items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-8 py-4 font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50">
                  Quét mã QR <QrCode className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                {heroStats.map((stat) => (
                  <div key={stat.label}>
                    <p className="break-words text-xl font-bold text-slate-900 lg:text-2xl">{stat.value}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wider text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="relative h-[560px] overflow-hidden rounded-[2.5rem] border border-white/60 bg-gradient-to-br from-[#172554] via-[#3730a3] to-[#7c3aed] p-8 text-white shadow-2xl shadow-indigo-300/40">
                <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-cyan-300/20 blur-2xl" />
                <div className="absolute -bottom-24 -left-20 h-80 w-80 rounded-full bg-fuchsia-400/25 blur-2xl" />
                <div className="absolute left-10 top-24 h-24 w-24 rounded-full border border-white/10" />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><WalletCards className="h-6 w-6" /></div>
                      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-200">Timi Banking</p><p className="font-display text-xl font-bold">Toàn hệ thống Timi</p></div>
                    </div>
                    <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur">Đang hoạt động</span>
                  </div>

                  <div className="my-auto rounded-[2rem] border border-white/20 bg-white/10 p-7 shadow-2xl backdrop-blur-md">
                    <div className="flex items-start justify-between gap-4">
                      <div><p className="text-sm text-blue-100">Tổng giá trị giao dịch hoàn tất</p><p className="font-display mt-2 text-4xl font-bold tracking-tight">{security.data ? currency.format(security.data.total_completed_volume) : "Đang tải..."}</p></div>
                      <ShieldCheck className="h-8 w-8 text-emerald-300" />
                    </div>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="rounded-2xl bg-slate-950/20 p-4"><p className="text-xs text-blue-200">Tổng giao dịch</p><p className="mt-1 text-2xl font-bold">{security.data?.total_transactions.toLocaleString("vi-VN") ?? "—"}</p></div>
                      <div className="rounded-2xl bg-slate-950/20 p-4"><p className="text-xs text-blue-200">Người dùng</p><p className="mt-1 text-2xl font-bold">{security.data?.total_users.toLocaleString("vi-VN") ?? "—"}</p></div>
                    </div>
                    <div className="mt-6 flex h-16 items-end gap-2" aria-hidden="true">
                      {[35, 52, 44, 68, 58, 82, 72, 94].map((height, index) => <span key={index} className="flex-1 rounded-t-lg bg-gradient-to-t from-cyan-400/50 to-white/80" style={{ height: `${height}%` }} />)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm text-blue-100">
                    <span>Dữ liệu tổng hợp toàn hệ thống</span>
                    <button
                      type="button"
                      onClick={() => document.getElementById("account-overview")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      className="inline-flex items-center gap-1 font-semibold text-white transition hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                    >
                      Xem tổng quan <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <div className="relative z-10 -mt-5 ml-6 w-fit rounded-2xl border border-white bg-white p-4 shadow-xl shadow-indigo-200/60">
                  <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50"><Shield className="h-5 w-5 text-emerald-600" /></div><div><p className="text-xs text-slate-400">Bảo vệ toàn hệ thống</p><p className="font-bold text-slate-900">{security.data?.blocked_transactions.toLocaleString("vi-VN") ?? "—"} giao dịch rủi ro</p></div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="w-full overflow-hidden bg-slate-900 py-6">
        <div className="dashboard-marquee flex w-max whitespace-nowrap">
          {[...trustBadges, ...trustBadges, ...trustBadges].map((badge, index) => (
            <span key={`${badge}-${index}`} className="mx-8 flex items-center gap-2 text-sm font-medium text-slate-400">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" /> {badge}
            </span>
          ))}
        </div>
      </section>

      {/* Khối account mới được đặt trong bố cục dashboard cũ. */}
      <section id="account-overview" className="scroll-mt-20 bg-[#F3F5FF] px-6 py-20 lg:px-12 xl:px-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-bold uppercase tracking-widest text-blue-600">Tổng quan tài khoản</p>
              <h2 className="font-display mt-3 text-3xl font-bold text-slate-950 lg:text-5xl">Tiền và bảo mật, trong một màn hình</h2>
              <p className="mt-4 max-w-2xl text-slate-500">Các số liệu bên dưới được tải từ API tài khoản và lịch sử giao dịch hiện tại.</p>
            </div>
            <button type="button" onClick={() => void refreshDashboard()} disabled={isRefreshing} className="inline-flex w-fit items-center gap-2 rounded-2xl border border-blue-100 bg-white px-5 py-3 font-bold text-blue-700 shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} /> Làm mới dữ liệu
            </button>
          </div>

          <div role="note" className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <p><strong>Phạm vi tài khoản Timi:</strong> số dư và thẻ thuộc sổ cái nội bộ của ứng dụng. Chuyển liên ngân hàng đang bị khóa vì chưa có cổng quyết toán thật.</p>
          </div>
          {hasAccountError && (
            <div role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">Không thể tải đầy đủ dữ liệu tài khoản. Hãy kiểm tra kết nối rồi chọn “Làm mới dữ liệu”.</div>
          )}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <article className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-xl shadow-blue-100/30">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-5 sm:px-7">
                <div><h3 className="font-display text-xl font-bold text-slate-900">Giao dịch gần đây</h3><p className="mt-1 text-sm text-slate-400">5 giao dịch mới nhất của tài khoản</p></div>
                <button type="button" onClick={() => navigate("/history")} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:text-blue-800">Xem tất cả <ArrowRight className="h-4 w-4" /></button>
              </div>
              {history.isLoading ? (
                <div className="flex items-center justify-center gap-3 p-12 text-blue-600"><Loader2 className="h-5 w-5 animate-spin" /> Đang tải giao dịch...</div>
              ) : recent.length ? (
                <ul className="divide-y divide-slate-100">
                  {recent.map((transaction) => {
                    const incoming = transaction.direction === "incoming";
                    return (
                      <li key={transaction.id} className="flex items-center gap-3 px-5 py-4 sm:px-7">
                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${incoming ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"}`}>
                          {incoming ? <ArrowDownLeft className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-800">{transaction.counterparty_name || transaction.payee_name}</p>
                          <p className="mt-0.5 text-xs text-slate-400">{transactionLabel(transaction)} · {new Date(transaction.created_at).toLocaleString("vi-VN")}</p>
                        </div>
                        <p className={`shrink-0 text-sm font-bold ${incoming ? "text-emerald-600" : "text-slate-800"}`}>{incoming ? "+" : "−"}{currency.format(transaction.amount)}</p>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="p-12 text-center text-sm text-slate-400">Bạn chưa có giao dịch nào.</div>
              )}
            </article>

            <div className="space-y-6">
              <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-blue-100/30">
                <h3 className="font-display text-xl font-bold text-slate-900">Thao tác nhanh</h3>
                <div className="mt-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  {quickActions.map(({ label, path, icon: Icon }) => (
                    <button key={path} type="button" onClick={() => navigate(path)} className="flex items-center gap-3 rounded-2xl bg-blue-50 px-4 py-3 text-left font-semibold text-blue-700 transition hover:bg-blue-100">
                      <Icon className="h-5 w-5" /> {label}<ArrowRight className="ml-auto h-4 w-4" />
                    </button>
                  ))}
                </div>
              </article>
              <article className="rounded-3xl border border-slate-100 bg-white p-6 shadow-xl shadow-blue-100/30">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-bold text-slate-900">Thiết lập bảo mật</h3>
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Hạng {overview.data?.security_grade ?? "—"}</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{security.data?.blocked_transactions ?? 0} giao dịch rủi ro đã được hệ thống chặn hoặc hủy.</p>
                <ul className="mt-5 space-y-3">
                  {overview.data?.security_checks.map((check) => (
                    <li key={check.label} className="flex items-start gap-3 text-sm">
                      <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${check.completed ? "text-emerald-500" : "text-slate-300"}`} />
                      <div><p className="font-semibold text-slate-700">{check.label}</p><p className="text-xs leading-5 text-slate-400">{check.detail}</p></div>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => navigate("/me")} className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white transition hover:bg-slate-800">Quản lý bảo mật</button>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-gradient-to-r from-white via-violet-50 to-blue-50 py-10 sm:py-12">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 lg:flex-row lg:items-center lg:justify-between lg:px-12 xl:px-20">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600 shadow-sm"><BookOpen className="h-6 w-6" /></div>
            <div><p className="text-sm font-bold uppercase tracking-widest text-blue-600">Hướng dẫn nhanh</p><h2 className="font-display mt-1 text-xl font-bold text-slate-900 sm:text-2xl">Chưa biết bắt đầu từ đâu?</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Xem hướng dẫn từng bước để chuyển tiền, quét QR và sử dụng các lớp bảo vệ của Timi.</p></div>
          </div>
          <button type="button" onClick={() => navigate("/demo")} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 font-bold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700">Xem hướng dẫn sử dụng <ArrowRight className="h-5 w-5" /></button>
        </div>
      </section>

      {managedQuery.data?.length ? (
        <section className="bg-[#F3F5FF] px-6 py-16 lg:px-12 xl:px-20">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div><p className="text-sm font-bold uppercase tracking-widest text-violet-600">Cập nhật từ Timi</p><h2 className="font-display mt-3 text-3xl font-bold text-slate-950">Thông tin dành cho bạn</h2></div>
              <span className="text-sm text-slate-500">Nội dung được quản lý từ Admin</span>
            </div>
            <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {managedQuery.data.map((item) => (
                <article key={item.id} className="overflow-hidden rounded-3xl border border-violet-100 bg-white shadow-sm">
                  {item.image_url && <img src={item.image_url} alt={item.title || "Thông tin từ Timi"} className="h-40 w-full object-contain" />}
                  <div className="p-5"><h3 className="font-bold text-slate-900">{item.title || "Thông tin từ Timi"}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{item.body}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="w-full bg-gradient-to-b from-white to-[#f5f3ff] py-24">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-600">Dịch vụ của Timi</p>
            <h2 className="font-display mb-5 text-3xl font-bold text-slate-900 lg:text-5xl">Giải pháp tài chính toàn diện</h2>
            <p className="text-lg text-slate-500">Từ chuyển tiền, thanh toán đến bảo vệ tài khoản, mọi chức năng chính đều có thể mở ngay từ đây.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <button key={service.title} type="button" onClick={() => navigate(service.path)} className="group overflow-hidden rounded-3xl border border-slate-100 bg-white text-left transition-all duration-500 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-100/50">
                  <div className="relative h-48 overflow-hidden">
                    <img src={service.image} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent" />
                    <div className={`absolute bottom-4 left-4 flex h-12 w-12 items-center justify-center rounded-xl shadow-lg ${service.color}`}><Icon className="h-6 w-6" /></div>
                  </div>
                  <div className="p-6"><h3 className="mb-2 text-xl font-bold text-slate-900">{service.title}</h3><p className="mb-4 leading-relaxed text-slate-500">{service.desc}</p><span className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 transition-all group-hover:gap-3">Mở tính năng <ArrowRight className="h-4 w-4" /></span></div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="w-full bg-slate-50/70 py-24">
        <div className="w-full px-6 lg:px-12 xl:px-20">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            <div className="relative">
              <div className="relative flex min-h-[500px] items-center justify-center overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-[#312e81] via-[#4f46e5] to-[#9333ea] p-8 shadow-2xl shadow-indigo-300/40">
                <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-cyan-300/20 blur-2xl" />
                <div className="absolute -bottom-20 -right-16 h-72 w-72 rounded-full bg-fuchsia-300/25 blur-2xl" />
                <div className="relative w-full max-w-sm rounded-[2rem] border border-white/20 bg-white/10 p-7 text-white backdrop-blur-md">
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 shadow-xl"><ShieldCheck className="h-10 w-10 text-emerald-300" /></div>
                  <h3 className="font-display mt-6 text-center text-2xl font-bold">Timi bảo vệ chủ động</h3>
                  <div className="mt-7 space-y-3">
                    {["Đối chiếu người nhận", "Phân tích dấu hiệu rủi ro", "Giải thích trước khi xác nhận"].map((label) => <div key={label} className="flex items-center gap-3 rounded-2xl bg-slate-950/20 px-4 py-3"><CheckCircle2 className="h-5 w-5 text-emerald-300" /><span className="font-medium">{label}</span></div>)}
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-8 right-4 max-w-xs rounded-2xl border border-slate-100 bg-white p-6 shadow-xl sm:-right-8"><div className="mb-2 flex items-center gap-2 text-blue-600"><ShieldCheck className="h-5 w-5" /><span className="font-bold">Bảo vệ theo từng bước</span></div><p className="text-sm font-medium text-slate-600">Timi giải thích rủi ro trước khi bạn quyết định.</p></div>
            </div>
            <div>
              <p className="mb-3 text-sm font-bold uppercase tracking-widest text-blue-600">Vì sao chọn Timi</p>
              <h2 className="font-display mb-6 text-3xl font-bold leading-tight text-slate-900 lg:text-5xl">Quản lý tiền thông minh hơn mỗi ngày</h2>
              <p className="mb-10 text-lg leading-relaxed text-slate-500">Thiết kế quen thuộc của dashboard cũ nay được kết hợp với dữ liệu tài khoản và các lớp bảo vệ đang hoạt động.</p>
              <div className="space-y-6">
                {whyFeatures.map((feature) => (
                  <div key={feature.title} className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50"><CheckCircle2 className="h-6 w-6 text-blue-600" /></div><div><h3 className="mb-1 text-lg font-bold text-slate-900">{feature.title}</h3><p className="text-slate-500">{feature.desc}</p></div></div>
                ))}
              </div>
              <button type="button" onClick={() => navigate("/services")} className="group mt-10 flex items-center gap-2 rounded-2xl bg-slate-900 px-8 py-4 font-bold text-white shadow-lg shadow-slate-200 transition-all hover:bg-slate-800">Khám phá Timi <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" /></button>
            </div>
          </div>
        </div>
      </section>

      <section className="relative w-full overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-700 py-24">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10" />
        <div className="relative z-10 w-full px-6 lg:px-12 xl:px-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-display mb-6 text-3xl font-bold text-white lg:text-5xl">Nhận thông tin tài chính hữu ích</h2>
            <p className="mb-10 text-lg text-blue-100">Đăng ký để nhận mẹo bảo vệ tài khoản và thông tin mới nhất từ Timi.</p>
            <form onSubmit={handleNewsletterSubmit} className="mx-auto flex max-w-lg flex-col gap-4 sm:flex-row">
              <div className="relative flex-1"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-200" /><input type="email" value={newsletterEmail} onChange={(event) => setNewsletterEmail(event.target.value)} required placeholder="Nhập email của bạn" aria-label="Email nhận bản tin" className="w-full rounded-2xl border border-white/20 bg-white/10 py-4 pl-12 pr-4 text-white placeholder:text-blue-200 focus:outline-none focus:ring-2 focus:ring-white/30" /></div>
              <button type="submit" disabled={newsletterSubmitting} className="rounded-2xl bg-white px-8 py-4 font-bold text-blue-700 shadow-lg transition-all hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70">{newsletterSubmitting ? "Đang đăng ký..." : "Đăng ký nhận tin"}</button>
            </form>
            {newsletterStatus && <p className="mt-4 text-sm font-medium text-emerald-200">{newsletterStatus}</p>}
            {newsletterError && <p role="alert" className="mt-4 text-sm font-medium text-rose-200">{newsletterError}</p>}
          </div>
        </div>
      </section>

      <footer className="w-full overflow-hidden bg-slate-950 py-8 text-slate-400 sm:py-12">
        <div className="w-full px-4 sm:px-6 lg:px-12 xl:px-20">
          <div className="mb-6 grid grid-cols-2 gap-x-5 gap-y-6 sm:gap-8 md:mb-12 lg:grid-cols-5">
            <div className="col-span-2 min-w-0 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2.5 sm:mb-5"><div className="h-9 w-9 overflow-hidden rounded-xl"><img src="/logo.png" alt="Timi" className="h-full w-full object-cover" /></div><span className="font-display bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-2xl font-bold text-transparent">Timi</span></div>
              <p className="mb-4 max-w-sm text-xs leading-5 sm:mb-6 sm:text-sm sm:leading-relaxed">Nền tảng tài chính thông minh được AI hỗ trợ bảo vệ, giúp mọi quyết định chuyển tiền của bạn an toàn hơn.</p>
              <div className="flex gap-3">{[Facebook, Twitter, Linkedin, Instagram].map((Icon, index) => <span key={index} aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-slate-400 sm:h-10 sm:w-10"><Icon className="h-4 w-4" /></span>)}</div>
            </div>
            <div className="min-w-0">
              <h3 className="mb-3 text-sm font-semibold text-white sm:mb-5">Dịch vụ</h3>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-3 sm:text-sm">
                <li><button type="button" onClick={() => navigate("/transfer")} className="transition-colors hover:text-blue-400">Chuyển tiền</button></li>
                <li><button type="button" onClick={() => navigate("/qr")} className="transition-colors hover:text-blue-400">Thanh toán QR</button></li>
                <li><button type="button" onClick={() => navigate("/history")} className="transition-colors hover:text-blue-400">Lịch sử giao dịch</button></li>
                <li><button type="button" onClick={() => navigate("/me")} className="transition-colors hover:text-blue-400">Quản lý tài khoản</button></li>
              </ul>
            </div>
            <div className="min-w-0">
              <h3 className="mb-3 text-sm font-semibold text-white sm:mb-5">Timi</h3>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-3 sm:text-sm">
                <li><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="transition-colors hover:text-blue-400">Tổng quan</button></li>
                <li><button type="button" onClick={() => navigate("/me")} className="transition-colors hover:text-blue-400">Bảo mật</button></li>
                <li><button type="button" onClick={() => navigate("/demo")} className="transition-colors hover:text-blue-400">Hướng dẫn</button></li>
              </ul>
            </div>
            <div className="col-span-2 min-w-0 lg:col-span-1">
              <h3 className="mb-3 text-sm font-semibold text-white sm:mb-5">Liên hệ</h3>
              <ul className="space-y-1.5 text-xs leading-5 sm:space-y-3 sm:text-sm"><li className="flex items-center gap-2"><Mail className="h-4 w-4" /> support@timi.com</li><li className="flex items-center gap-2"><Phone className="h-4 w-4" /> 1900 1234</li><li className="flex items-center gap-2"><MapPin className="h-4 w-4" /> TP. Hà Nội</li></ul>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-900 pt-5 text-xs sm:gap-4 sm:pt-8 sm:text-sm md:flex-row">
            <p>© 2026 Timi. Bảo lưu mọi quyền.</p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 sm:gap-x-6 sm:gap-y-2 md:justify-end"><button type="button" onClick={() => navigate("/help")} className="transition-colors hover:text-blue-400">Help Center</button><button type="button" onClick={() => navigate("/privacy")} className="transition-colors hover:text-blue-400">Chính sách bảo mật</button><button type="button" onClick={() => navigate("/terms")} className="transition-colors hover:text-blue-400">Điều khoản sử dụng</button><Link to="/cookies" className="transition-colors hover:text-blue-400">Cookie</Link></div>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes dashboard-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .dashboard-marquee { animation: dashboard-marquee 24s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .dashboard-marquee { animation: none; }
        }
      `}</style>
    </div>
  );
}
