import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, Download, QrCode, Smartphone, ShieldCheck, Star } from "lucide-react";

import PublicSiteChrome from "@/components/layout/PublicSiteChrome";
import axiosInstance from "@/services/api/axios";
import { useAuthStore } from "@/stores/authStore";

type ManagedContent = { id: string; title: string | null; body: string | null; image_url: string | null };

export default function DownloadPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const managedQuery = useQuery({
    queryKey: ["public-content", "download"],
    queryFn: async () => (await axiosInstance.get<ManagedContent[]>("/v1/content/download")).data,
  });

  return (
    <PublicSiteChrome>
      <main className="bg-white">
        <section className="bg-gradient-to-br from-violet-50 via-white to-blue-50 px-6 py-16 sm:py-24 lg:px-12 xl:px-20">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-violet-600"><Download className="h-4 w-4" /> Tải Timi</div>
              <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-tight tracking-tight text-slate-950 sm:text-6xl">Tài chính an tâm, ngay trong tầm tay.</h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">Dùng Timi trên web ngay hôm nay. Phiên bản di động sẽ được phát hành theo từng nền tảng và thông báo tại đây.</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={() => setSelectedPlatform("App Store")} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-3.5 font-bold text-white transition hover:bg-slate-800"><Smartphone className="h-5 w-5" /> App Store</button>
                <button type="button" onClick={() => setSelectedPlatform("Android")} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 font-bold text-slate-800 transition hover:border-blue-300 hover:bg-blue-50"><Smartphone className="h-5 w-5" /> Google Play</button>
              </div>
              <div className="mt-5 flex items-center gap-4 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                <img src="/timi-android-download-qr.png" alt="Mã QR tải ứng dụng Timi cho Android" className="h-32 w-32 shrink-0 rounded-xl bg-white p-1 object-contain shadow-sm" />
                <div>
                  <p className="font-bold text-slate-900">Tải Timi cho Android</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">Quét mã QR để mở liên kết tải ứng dụng trên điện thoại Android.</p>
                </div>
              </div>
              {selectedPlatform && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800" role="status"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />{selectedPlatform === "Android" ? "Quét mã QR bên trên để tải bản Android của Timi." : `Bản ${selectedPlatform} đang được hoàn thiện. Bạn có thể dùng Timi trên web ngay bây giờ.`}</div>}
            </div>
            <div className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-2xl shadow-violet-200 sm:p-8">
              <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-slate-400">Timi Banking</p><p className="mt-1 text-xl font-bold">Mở nhanh trên trình duyệt</p></div><ShieldCheck className="h-7 w-7 text-emerald-400" /></div>
              <div className="mt-8 flex flex-col items-center rounded-3xl bg-white p-7 text-center text-slate-900"><QrCode className="h-28 w-28 text-slate-950" strokeWidth={1.4} /><p className="mt-5 font-bold">Quét để mở Timi</p><p className="mt-1 text-sm text-slate-500">Hoặc chọn nút bên dưới</p></div>
              <button type="button" onClick={() => navigate(isAuthenticated ? "/dashboard" : "/login")} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 py-3.5 font-bold transition hover:bg-blue-400">Dùng Timi trên web <ArrowRight className="h-5 w-5" /></button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20 lg:px-12 xl:px-20">
          <div className="grid gap-5 md:grid-cols-3">
            {[{ icon: ShieldCheck, title: "Bảo vệ nhiều lớp", text: "AI Anti-Scam, PIN và xác thực khuôn mặt đồng hành trong các thao tác nhạy cảm." }, { icon: Star, title: "Trải nghiệm gọn gàng", text: "Theo dõi số dư, lịch sử và các tính năng chính trong một không gian rõ ràng." }, { icon: Smartphone, title: "Dùng ở mọi nơi", text: "Timi được thiết kế responsive để bạn có thể bắt đầu từ điện thoại hoặc máy tính." }].map(({ icon: Icon, title, text }) => <article key={title} className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Icon className="h-6 w-6" /></div><h2 className="mt-6 text-xl font-bold text-slate-900">{title}</h2><p className="mt-3 leading-7 text-slate-500">{text}</p></article>)}
          </div>
        </section>

        {managedQuery.data?.length ? <section className="bg-[#F3F5FF] px-6 py-16 lg:px-12 xl:px-20"><div className="mx-auto max-w-6xl"><p className="text-sm font-bold uppercase tracking-widest text-violet-600">Thông báo phát hành</p><div className="mt-6 grid gap-5 md:grid-cols-2">{managedQuery.data.map((item) => <article key={item.id} className="rounded-3xl border border-violet-100 bg-white p-6 shadow-sm">{item.image_url && <img src={item.image_url} alt={item.title || "Thông tin tải Timi"} className="mb-5 h-40 w-full rounded-2xl object-contain" />}<h2 className="text-xl font-bold text-slate-900">{item.title || "Tải Timi"}</h2><p className="mt-3 leading-7 text-slate-600">{item.body}</p></article>)}</div></div></section> : null}

        <section className="px-6 py-16 text-center"><p className="text-slate-500">Bạn muốn biết Timi bảo vệ giao dịch như thế nào?</p><Link to="/demo" className="mt-4 inline-flex items-center gap-2 font-bold text-blue-600 hover:text-blue-700">Xem demo AI Anti-Scam <ArrowRight className="h-4 w-4" /></Link></section>
      </main>
    </PublicSiteChrome>
  );
}
