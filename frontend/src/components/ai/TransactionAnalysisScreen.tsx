import { useEffect, useState } from "react";
import { ScanLine, ShieldCheck, Sparkles } from "lucide-react";

import TimiChibi from "@/components/ai/TimiChibi";

const ANALYSIS_MESSAGES = [
  "Timi đang đối chiếu tên người nhận và ngân hàng nè…",
  "Ráng chờ Timi một xíu nhé, mình đang quét các dấu hiệu lừa đảo.",
  "Mình đang kiểm tra số tiền, lịch sử và những cảnh báo liên quan.",
  "Sắp xong rồi! Timi ưu tiên an toàn của bạn trước nha.",
];

const ANALYSIS_STEPS = [
  { icon: ScanLine, label: "Đối chiếu người nhận và ngân hàng" },
  { icon: ShieldCheck, label: "Quét cảnh báo và dấu hiệu bất thường" },
];

/** Keeps the customer company while the real risk request is in progress. */
export default function TransactionAnalysisScreen() {
  const [messageIndex, setMessageIndex] = useState(0);
  const activeStep = messageIndex % ANALYSIS_STEPS.length;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % ANALYSIS_MESSAGES.length);
    }, 2800);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-blue-50/40 px-4 py-8">
      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg items-center justify-center">
        <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/90 bg-white/90 p-6 text-center shadow-xl shadow-blue-100 backdrop-blur sm:p-8">
          <div className="absolute -left-8 -top-8 h-32 w-32 rounded-full bg-blue-200/40 blur-2xl" />
          <div className="absolute -bottom-10 -right-8 h-36 w-36 rounded-full bg-indigo-200/40 blur-2xl" />
          <div className="relative">
            <div className="mx-auto grid h-36 place-items-center">
              <TimiChibi walking />
            </div>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />AI Anti-Scam đang làm việc
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Timi đang bảo vệ giao dịch của bạn</h1>
            <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-left" aria-live="polite">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-50 shadow-sm"><Sparkles className="h-4 w-4 text-indigo-500" /></div>
                <p className="text-sm leading-relaxed text-slate-700">{ANALYSIS_MESSAGES[messageIndex]}</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-left">
              {ANALYSIS_STEPS.map(({ icon: Icon, label }, index) => (
                <div key={label} className="flex items-center gap-3 text-sm text-slate-600">
                  <span className={`grid h-8 w-8 place-items-center rounded-full ${index === activeStep ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"}`}>
                    <Icon className={`h-4 w-4 ${index === activeStep ? "animate-pulse" : ""}`} />
                  </span>
                  <span>{label}</span>
                  {index === activeStep && <span className="ml-auto h-1.5 w-14 overflow-hidden rounded-full bg-indigo-100"><span className="block h-full w-2/3 animate-pulse rounded-full bg-indigo-400" /></span>}
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs leading-relaxed text-slate-400">Bạn không cần thao tác gì lúc này. Timi sẽ báo ngay khi có kết quả.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
