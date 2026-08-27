import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Clock3,
  CircleAlert,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import type { AssessResponse } from "@/services/api/transactions";
import TimiChibi from "@/components/ai/TimiChibi";

export type RiskAssessment = AssessResponse;

interface AIRiskModalProps {
  riskData: RiskAssessment;
  onProceed: (pin: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  requiresFaceVerification?: boolean;
}

function remainingSeconds(displayedAt: string, countdownSeconds: number): number {
  const deadline = new Date(displayedAt).getTime() + countdownSeconds * 1000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export default function AIRiskModal({
  riskData,
  onProceed,
  onCancel,
  isLoading,
  requiresFaceVerification = false,
}: AIRiskModalProps) {
  const warning = riskData.warning;
  const [verified, setVerified] = useState(false);
  const [pin, setPin] = useState("");
  const [pinRequested, setPinRequested] = useState(false);
  const timerRef = useRef<number | null>(null);
  const [remaining, setRemaining] = useState(() =>
    warning ? remainingSeconds(warning.displayed_at, warning.countdown_seconds) : 0,
  );

  useEffect(() => {
    if (!warning) return undefined;

    const updateCountdown = () => {
      const nextRemaining = remainingSeconds(warning.displayed_at, warning.countdown_seconds);
      setRemaining(nextRemaining);
      if (nextRemaining === 0 && timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    updateCountdown();
    timerRef.current = window.setInterval(updateCountdown, 250);
    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [warning]);

  const stopCountdown = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleCancel = () => {
    stopCountdown();
    onCancel();
  };

  const handleProceed = (transactionPin: string) => {
    stopCountdown();
    onProceed(transactionPin);
  };

  const isHighRisk = riskData.risk_level === "high";
  const canContinue = remaining === 0 && verified && !isLoading;
  const canProceed = pinRequested && /^\d{4,6}$/.test(pin) && !isLoading;
  const riskPercentage = Math.round(Math.min(1, Math.max(0, riskData.risk_score)) * 100);
  const reasonText = warning?.transparency_reason ?? riskData.explanation;
  const displayReason = reasonText
    .replace(/^(?:Các dấu hiệu được hệ thống đối chiếu|Điểm cần lưu ý):\s*/i, "")
    .trim();
  const reasonLines = displayReason
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const riskTone = isHighRisk
    ? {
        header: "from-rose-50 via-white to-white",
        icon: "bg-rose-100 text-rose-600",
        badge: "border-rose-200 bg-rose-50 text-rose-700",
        fill: "from-rose-500 to-pink-500",
        banner: "border-rose-200/80 bg-rose-50/80 text-rose-800",
        alert: "border-rose-200 bg-rose-50/80 text-rose-800",
        action: "from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 shadow-rose-200",
      }
    : {
        header: "from-amber-50 via-white to-white",
        icon: "bg-amber-100 text-amber-600",
        badge: "border-amber-200 bg-amber-50 text-amber-700",
        fill: "from-amber-400 to-orange-500",
        banner: "border-amber-200/80 bg-amber-50/80 text-amber-900",
        alert: "border-amber-200 bg-amber-50/80 text-amber-900",
        action: "from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-violet-200",
      };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex h-dvh max-h-dvh min-h-0 touch-pan-y items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/50 p-3 backdrop-blur-[3px] sm:items-center sm:p-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="risk-modal-title"
        className={`flex w-full max-w-[32rem] max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-[2rem] border border-white/80 bg-white shadow-[0_24px_80px_-24px_rgba(15,23,42,0.45)] transition-opacity sm:max-h-[calc(100dvh-2rem)] ${pinRequested ? "pointer-events-none opacity-30" : ""}`}
      >
        <div className={`relative overflow-hidden border-b border-slate-100 bg-gradient-to-b px-5 pb-3 pt-3 text-center sm:px-7 ${riskTone.header}`}>
          <div className="pointer-events-none absolute -right-12 -top-16 h-32 w-32 rounded-full bg-violet-100/50 blur-2xl" />
          <div className="pointer-events-none absolute -left-16 bottom-0 h-24 w-24 rounded-full bg-indigo-100/40 blur-2xl" />
          <div className={`relative mx-auto mb-1.5 grid h-11 w-11 place-items-center rounded-2xl shadow-sm ring-1 ring-black/5 ${riskTone.icon}`}>
            {isHighRisk ? (
              <ShieldX className="h-7 w-7" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-7 w-7" aria-hidden="true" />
            )}
          </div>
          <h2 id="risk-modal-title" className="relative text-xl font-bold tracking-tight text-slate-950">
            {warning?.title ?? "Cảnh báo rủi ro"}
          </h2>
          <p className="relative mx-auto mt-1 max-w-lg text-sm leading-5 text-slate-600">
            Timi cảnh báo để bạn kiểm tra; quyết định cuối cùng vẫn thuộc về bạn.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-hidden px-5 py-4 sm:px-7">
          <div className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm ${riskTone.banner}`}>
            <div className="shrink-0">
              <TimiChibi compact warning walking />
            </div>
            <p className="text-sm font-semibold leading-5">
              {isHighRisk
                ? "Ôi, Timi thấy vài dấu hiệu chưa ổn. Mình dừng lại một nhịp nhé — đừng vội chuyển tiền!"
                : "Timi thấy giao dịch này cần được kiểm tra kỹ hơn. Hãy bình tĩnh xem lại trước khi quyết định nhé."}
            </p>
          </div>
          <section className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3" aria-label="Mức độ rủi ro">
            <div className="flex items-center gap-3 text-sm">
              <span className="font-medium text-slate-600">Mức độ rủi ro</span>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div
                  className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200/80"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={riskPercentage}
                  aria-label={`Mức độ rủi ro ${riskPercentage}%`}
                >
                  <div
                    className={`h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ${riskTone.fill}`}
                    style={{ width: `${Math.max(8, riskPercentage)}%` }}
                  />
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${riskTone.badge}`}>
                  {riskPercentage}%
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-rose-50 text-rose-600 ring-1 ring-rose-100">
                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Lý do cảnh báo</p>
            </div>
            <ul className="space-y-1 text-sm leading-5 text-slate-700" title={reasonText}>
              {reasonLines.map((line, index) => {
                const isSectionLabel = !line.startsWith("-") && line.endsWith(":");
                const text = line.replace(/^-\s*/, "");
                return (
                  <li
                    key={`${line}-${index}`}
                    className={isSectionLabel ? "font-semibold text-slate-600" : "flex items-start gap-2"}
                  >
                    {isSectionLabel ? null : <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" aria-hidden="true" />}
                    <span>{text}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <div className={`flex items-start gap-2.5 rounded-2xl border p-3 text-sm leading-5 ${riskTone.alert}`}>
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>{warning?.message ?? riskData.recommendation}</p>
          </div>

          {remaining > 0 ? (
            <div className="flex items-center gap-3 rounded-2xl border border-violet-200/80 bg-violet-50/70 p-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-100">
                <Clock3 className="h-4 w-4" aria-hidden="true" />
              </span>
              <p className="text-sm font-semibold text-violet-900">Có thể tiếp tục sau {remaining} giây</p>
            </div>
          ) : (
            <>
              <label htmlFor="independent-recipient-check" className="flex cursor-pointer gap-2.5 rounded-2xl border border-emerald-200/80 bg-emerald-50/70 p-3 text-sm leading-5 text-emerald-950 transition-colors hover:bg-emerald-50">
                <input
                  id="independent-recipient-check"
                  type="checkbox"
                  checked={verified}
                  onChange={(event) => setVerified(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                />
                <span>Tôi đã kiểm tra lại thông tin người nhận qua kênh độc lập.</span>
              </label>
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy giao dịch
          </button>
          <button
            type="button"
            onClick={() => {
              if (requiresFaceVerification) handleProceed("");
              else if (!pinRequested) setPinRequested(true);
              else handleProceed(pin);
            }}
            disabled={requiresFaceVerification ? !canContinue : (pinRequested ? !canProceed : !canContinue)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r px-4 py-3 font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 ${riskTone.action}`}
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white/80" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
            Vẫn tiếp tục
          </button>
        </div>
      </div>

      {pinRequested && (
        <div className="fixed inset-0 z-[10000] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/40 p-4 backdrop-blur-[2px] sm:items-center">
          <div className="my-4 w-full max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_24px_80px_-24px_rgba(15,23,42,0.55)]">
            <div className="mb-5 text-center">
              <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-600 ring-1 ring-violet-200">
                <ShieldCheck className="h-7 w-7" aria-hidden="true" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-slate-950">Mã PIN giao dịch</h3>
              <p className="mt-1 text-sm leading-5 text-slate-600">Nhập PIN để hoàn tất giao dịch.</p>
            </div>
            <input
              autoFocus
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              type="password"
              autoComplete="off"
              placeholder="PIN 4–6 chữ số"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xl tracking-[0.5em] text-slate-950 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => { setPinRequested(false); setPin(""); }}
                disabled={isLoading}
                className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                Quay lại
              </button>
              <button
                type="button"
                onClick={() => handleProceed(pin)}
                disabled={!canProceed}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 font-semibold text-white shadow-md shadow-violet-200 transition-all hover:from-violet-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" aria-hidden="true" />Hoàn tất</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
