import { useState } from "react";
import { KeyRound, Loader2, Mail, ShieldCheck } from "lucide-react";

import Modal from "@/components/ui/Modal";
import { getApiErrorMessage } from "@/utils/apiError";

export default function DeviceLoginOtpModal({
  email,
  expiresInSeconds,
  isSaving,
  onCancel,
  onSubmit,
}: {
  email: string;
  expiresInSeconds: number;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (otp: string) => Promise<void>;
}) {
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");

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
      </form>
    </Modal>
  );
}
