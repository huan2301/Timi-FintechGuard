import { useEffect, useState } from "react";
import { KeyRound, Loader2, Mail, RefreshCw, ShieldCheck } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/utils/apiError";

export default function DeviceLoginOtpModal({
  email,
  expiresInSeconds,
  resendAvailableInSeconds,
  isSaving,
  isResending,
  onCancel,
  onResend,
  onSubmit,
}: {
  email: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
  isSaving: boolean;
  isResending: boolean;
  onCancel: () => void;
  onResend: () => Promise<number>;
  onSubmit: (otp: string) => Promise<void>;
}) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendInSeconds, setResendInSeconds] = useState(Math.max(0, resendAvailableInSeconds));

  useEffect(() => {
    setResendInSeconds(Math.max(0, resendAvailableInSeconds));
  }, [resendAvailableInSeconds]);

  useEffect(() => {
    if (resendInSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setResendInSeconds((current) => Math.max(0, current - 1));
    }, 1_000);
    return () => window.clearTimeout(timer);
  }, [resendInSeconds]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      setError("Mã xác minh phải gồm đúng 6 chữ số.");
      return;
    }
    setError("");
    try {
      await onSubmit(otp);
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Không thể xác minh thiết bị. Hãy thử lại."));
    }
  };

  const resend = async () => {
    if (resendInSeconds > 0 || isResending || isSaving) return;
    setError("");
    setNotice("");
    try {
      const nextCooldown = await onResend();
      setOtp("");
      setResendInSeconds(Math.max(0, nextCooldown));
      setNotice("Mã xác minh mới đã được gửi. Mã cũ không còn hiệu lực.");
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Không thể gửi lại mã. Hãy thử lại sau."));
    }
  };

  return (
    <Modal
      open
      onClose={onCancel}
      ariaLabel="Xác minh thiết bị đăng nhập mới"
      className="max-w-md"
      showCloseButton
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <ShieldCheck className="h-6 w-6" />
      </div>
      <h2 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">
        Xác minh thiết bị mới
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">
        Để bảo vệ phiên đang dùng, Timi chỉ đăng xuất thiết bị cũ sau khi mã email này đúng
        và bạn hoàn tất xác nhận vị trí.
      </p>

      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">Đã gửi mã tới</p>
          <p className="mt-1 truncate text-sm font-semibold text-blue-900">{email}</p>
          <p className="mt-1 text-xs text-blue-700">
            Mã hết hạn sau khoảng {Math.max(1, Math.ceil(expiresInSeconds / 60))} phút.
          </p>
        </div>
      </div>

      <form className="mt-5" onSubmit={submit}>
        <label htmlFor="device-login-otp" className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Mã OTP
        </label>
        <div className="relative mt-1.5">
          <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
          <input
            id="device-login-otp"
            autoFocus
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            className={`w-full rounded-2xl border bg-white py-4 pl-12 pr-4 text-center text-xl font-bold tracking-[0.35em] text-slate-900 outline-none transition focus:ring-4 ${
              error
                ? "border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-red-500/10"
                : "border-slate-200 focus:border-blue-500 focus:ring-blue-500/10"
            }`}
          />
        </div>
        {error && <p role="alert" className="ml-1 mt-2 text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isSaving || otp.length !== 6}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 py-4 font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
          {isSaving ? "Đang xác minh…" : "Xác minh và tiếp tục"}
        </button>

        <button
          type="button"
          onClick={() => void resend()}
          disabled={isSaving || isResending || resendInSeconds > 0}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 py-3.5 text-sm font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
        >
          {isResending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isResending
            ? "Đang gửi lại…"
            : resendInSeconds > 0
              ? `Gửi lại mã sau ${resendInSeconds}s`
              : "Gửi lại mã xác minh"}
        </button>
        {notice && <p role="status" className="mt-2 text-center text-xs font-medium text-emerald-600">{notice}</p>}
      </form>
    </Modal>
  );
}
