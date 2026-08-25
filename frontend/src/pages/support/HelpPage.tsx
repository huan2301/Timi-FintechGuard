import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Copy, MessageCircle, Phone, ShieldCheck } from "lucide-react";
import { useState } from "react";
import axiosInstance from "@/services/api/axios";
import PublicSiteChrome from "@/components/layout/PublicSiteChrome";
import { useAuthStore } from "@/stores/authStore";

type SupportContact = { email: string; phone: string };
type ManagedFaq = { title: string | null; body: string | null; image_url: string | null; content_type?: string };

const faqs = [
  ["Làm sao để đổi mật khẩu?", "Vào Tài khoản, chọn Bảo mật tài khoản rồi nhập mật khẩu hiện tại và mật khẩu mới."],
  ["Tôi quên mã PIN giao dịch thì phải làm gì?", "Vào Tài khoản > Thay đổi mã PIN để cập nhật lại PIN sau khi xác thực."],
  ["Tại sao giao dịch cần xác minh khuôn mặt?", "Đây là lớp bảo vệ giúp xác nhận đúng chủ tài khoản trước các thao tác nhạy cảm."],
  ["Tôi cần hỗ trợ trực tiếp thì liên hệ ở đâu?", "Bạn có thể gửi email cho admin hoặc sử dụng thông tin liên hệ chính thức được hiển thị trong ứng dụng."],
];

export default function HelpPage() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [open, setOpen] = useState(0);
  const contactQuery = useQuery({ queryKey: ["support-contact"], queryFn: async () => (await axiosInstance.get<SupportContact>("/v1/support/contact")).data, enabled: isAuthenticated, staleTime: 5 * 60_000 });
  const contentQuery = useQuery({ queryKey: ["public-content", "help"], queryFn: async () => (await axiosInstance.get<ManagedFaq[]>("/v1/content/help")).data });
  const faqItems = contentQuery.data?.length
    ? contentQuery.data.map((item) => ({ question: item.title || "Câu hỏi", answer: item.body || "", image: item.image_url }))
    : faqs.map(([question, answer]) => ({ question, answer, image: null }));
  const copy = (value?: string | null) => void navigator.clipboard?.writeText(value || "");

  return (
    <PublicSiteChrome>
      <main className="w-full">
        <section className="w-full bg-[#F3F5FF]">
          <div className="w-full px-6 py-9 lg:px-12 lg:py-12 xl:px-20">
            <p className="font-display text-sm font-bold uppercase tracking-[0.2em] text-[#4F6BFF]">Timi · Hỗ trợ</p>
            <h1 className="font-display mt-3 max-w-3xl text-3xl font-bold leading-tight tracking-tight text-[#0B0B0B] sm:text-4xl">Câu hỏi thường gặp</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">Tìm câu trả lời nhanh hoặc liên hệ với đội ngũ hỗ trợ của Timi.</p>
            {!isAuthenticated && <p className="mt-4 max-w-2xl rounded-2xl border border-blue-100 bg-white/70 px-4 py-3 text-sm text-blue-700">Bạn có thể xem câu hỏi thường gặp mà không cần đăng nhập. Đăng nhập để xem thông tin liên hệ admin.</p>}
          </div>
        </section>

        <section className="w-full bg-white">
          <div className="w-full px-6 py-12 lg:px-12 lg:py-20 xl:px-20">
            <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="overflow-hidden rounded-[2rem] border border-slate-100 bg-white shadow-sm">
                {faqItems.map(({ question, answer, image }, index) => (
                  <div key={`${question}-${index}`} className={index ? "border-t border-slate-100" : ""}>
                    <button type="button" onClick={() => setOpen(open === index ? -1 : index)} className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left font-semibold text-slate-900 sm:px-6">
                      <span>{question}</span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-[#4F6BFF] transition-transform ${open === index ? "rotate-180" : ""}`} />
                    </button>
                    {open === index && <div className="px-5 pb-5 sm:px-6"><p className="text-sm leading-6 text-slate-500">{answer}</p>{image && <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-slate-50"><img src={image} alt={question} className="max-h-64 w-full object-contain" /></div>}</div>}
                  </div>
                ))}
              </section>

              <section className="rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E9ECFF] text-[#4F6BFF]"><MessageCircle className="h-5 w-5" /></div><div><h2 className="font-display font-bold text-slate-900">Liên hệ admin</h2><p className="text-sm text-slate-400">Thông tin hỗ trợ chính thức</p></div></div>
                {contactQuery.isPending ? <p className="text-sm text-slate-400">Đang tải thông tin...</p> : contactQuery.isError ? <p className="text-sm text-red-500">Chưa cấu hình thông tin liên hệ admin.</p> : contactQuery.data && <div className="space-y-3"><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gmail admin</p><p className="mt-1 break-all font-semibold text-slate-800">{contactQuery.data.email}</p></div><button type="button" onClick={() => copy(contactQuery.data!.email)} className="rounded-lg p-2 text-[#4F6BFF] hover:bg-[#E9ECFF]" aria-label="Sao chép email"><Copy className="h-4 w-4" /></button></div></div><div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Số điện thoại admin</p><p className="mt-1 font-semibold text-slate-800">{contactQuery.data.phone}</p></div><button type="button" onClick={() => copy(contactQuery.data!.phone)} className="rounded-lg p-2 text-[#4F6BFF] hover:bg-[#E9ECFF]" aria-label="Sao chép số điện thoại"><Phone className="h-4 w-4" /></button></div></div><div className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-xs leading-5 text-amber-700"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> Chỉ sử dụng thông tin liên hệ hiển thị trong ứng dụng.</div></div>}
              </section>
            </div>
          </div>
        </section>
      </main>
    </PublicSiteChrome>
  );
}
