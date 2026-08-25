import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
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
  const riskPercentage = Math.round(riskData.risk_score * 100);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex h-dvh max-h-dvh min-h-0 touch-pan-y items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/60 p-4 backdrop-blur-sm sm:items-center">
      <div className={`my-4 w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl transition-opacity ${pinRequested ? "pointer-events-none opacity-30" : ""}`}>
        <div className={`p-4 text-center ${isHighRisk ? "bg-red-50" : "bg-amber-50"}`}>
          <div className="mb-2 flex justify-center">
            {isHighRisk ? (
              <ShieldX className="h-10 w-10 text-red-600" />
            ) : (
              <ShieldAlert className="h-10 w-10 text-amber-600" />
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            {warning?.title ?? "Cảnh báo rủi ro"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Hệ thống cảnh báo, còn quyết định cuối cùng vẫn thuộc về bạn.
          </p>
        </div>

        <div className="space-y-3 p-4">
          <div className={`flex items-center gap-3 rounded-2xl border p-3 ${isHighRisk ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
            <TimiChibi compact warning walking />
            <p className={`text-xs font-medium leading-relaxed ${isHighRisk ? "text-rose-800" : "text-amber-800"}`}>
              {isHighRisk
                ? "Ôi, Timi thấy vài dấu hiệu chưa ổn. Mình dừng lại một nhịp nhé — đừng vội chuyển tiền!"
                : "Timi thấy giao dịch này cần được kiểm tra kỹ hơn. Hãy bình tĩnh xem lại trước khi quyết định nhé."}
            </p>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-slate-600">Mức độ rủi ro</span>
              <span className={isHighRisk ? "font-bold text-red-600" : "font-bold text-amber-600"}>
                {riskPercentage}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={isHighRisk ? "h-full bg-red-500" : "h-full bg-amber-500"}
                style={{ width: `${Math.max(8, riskPercentage)}%` }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Lý do cảnh báo
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {warning?.transparency_reason ?? riskData.explanation}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Đây là các dấu hiệu hệ thống đã đối chiếu từ giao dịch và dữ liệu cảnh báo. Vui lòng kiểm tra kỹ trước khi tiếp tục.
            </p>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-800">
            {warning?.message ?? riskData.recommendation}
          </div>

          {remaining > 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="font-semibold text-amber-800">Vui lòng cân nhắc trong {remaining} giây</p>
              <p className="mt-1 text-xs text-amber-700">Nút tiếp tục sẽ được mở khi countdown kết thúc.</p>
            </div>
          ) : (
            <>
            <label htmlFor="independent-recipient-check" className="flex cursor-pointer gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <input
                id="independent-recipient-check"
                type="checkbox"
                checked={verified}
                onChange={(event) => setVerified(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-emerald-600"
              />
              <span>Tôi đã kiểm tra lại thông tin người nhận qua kênh độc lập.</span>
            </label>
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 p-4">
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy giao dịch
          </button>
          <button
            onClick={() => {
              if (requiresFaceVerification) handleProceed("");
              else if (!pinRequested) setPinRequested(true);
              else handleProceed(pin);
            }}
            disabled={requiresFaceVerification ? !canContinue : (pinRequested ? !canProceed : !canContinue)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-rose-100" /> : <ShieldCheck className="h-4 w-4" />}
            Vẫn tiếp tục
          </button>
        </div>
      </div>

      {pinRequested && (
        <div className="fixed inset-0 z-[10000] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/35 p-4 sm:items-center">
          <div className="my-4 w-full max-w-sm rounded-3xl border border-rose-200 bg-rose-50 p-6 shadow-2xl">
            <div className="mb-4 text-center"><div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100"><ShieldCheck className="h-7 w-7 text-rose-600" /></div><h3 className="text-xl font-bold text-rose-950">Mã PIN giao dịch</h3><p className="mt-1 text-sm text-rose-700">Nhập PIN để hoàn tất giao dịch.</p></div>
            <input autoFocus value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" type="password" autoComplete="off" placeholder="PIN 4–6 chữ số" className="w-full rounded-xl border border-rose-200 bg-white p-4 text-center text-xl tracking-[0.5em] text-rose-950 outline-none placeholder:text-rose-300 focus:border-rose-400 focus:ring-2 focus:ring-rose-300" />
            <div className="mt-4 flex gap-3"><button onClick={() => { setPinRequested(false); setPin(""); }} disabled={isLoading} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50">Quay lại</button><button onClick={() => handleProceed(pin)} disabled={!canProceed} className="flex-1 rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">Hoàn tất</button></div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
