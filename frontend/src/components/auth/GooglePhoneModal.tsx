import { useState } from "react";
import { ArrowRight, Phone, ShieldCheck, X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { getApiErrorMessage } from "@/utils/apiError";

export default function GooglePhoneModal({
  email,
  fullName,
  isSaving,
  onCancel,
  onSubmit,
}: {
  email: string;
  fullName: string;
  isSaving: boolean;
  onCancel: () => void;
  onSubmit: (phone: string) => Promise<void>;
}) {
  useBodyScrollLock(true, "google-phone-modal");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (phone.length !== 10) {
      setError("Số điện thoại phải gồm đúng 10 chữ số.");
      return;
    }
    setError("");
    try {
      await onSubmit(phone);
    } catch (requestError: unknown) {
      setError(getApiErrorMessage(requestError, "Không thể lưu số điện thoại. Hãy thử lại."));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/35 p-4 backdrop-blur-sm sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="google-phone-title"
        className="my-4 w-full max-w-md rounded-3xl border border-white/70 bg-white/95 p-7 shadow-2xl shadow-slate-900/20 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Phone className="h-5 w-5" strokeWidth={2.25} />
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="-mr-1 -mt-1 rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5">
          <h2 id="google-phone-title" className="text-2xl font-bold tracking-tight text-slate-900">
            Hoàn tất đăng nhập
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Chào {fullName}. Để mở tài khoản Timi, hãy thêm số điện thoại của bạn.
          </p>
        </div>

        <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Tài khoản Google</p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-700">{email}</p>
        </div>

        <form onSubmit={submit} className="mt-5">
          <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500" htmlFor="google-phone">
            Số điện thoại
          </label>
          <div className="relative mt-1.5">
            <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-700" strokeWidth={2.25} />
            <input
              id="google-phone"
              autoFocus
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              maxLength={10}
              placeholder="0901234567"
              value={phone}
              onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
              className={`w-full rounded-2xl border bg-white py-4 pl-12 pr-4 text-slate-800 outline-none transition-all focus:ring-4 ${error ? "border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-red-500/10" : "border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-500/10"}`}
            />
          </div>
          {error && <p className="mt-2 ml-1 text-xs text-red-500">{error}</p>}

          <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs leading-relaxed text-blue-700">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Số này được dùng làm tài khoản Timi Bank và phải là duy nhất.
          </div>

          <button
            type="submit"
            disabled={isSaving}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 py-4 font-bold text-white shadow-xl shadow-slate-200 transition-all hover:from-slate-800 hover:to-slate-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSaving ? (
              <><span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />Đang hoàn tất…</>
            ) : (
              <>Hoàn tất và tiếp tục <ArrowRight className="h-5 w-5" /></>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
