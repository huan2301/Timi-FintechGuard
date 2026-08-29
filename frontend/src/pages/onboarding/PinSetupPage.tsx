import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Loader2,
  ArrowLeft,
  Shield,
} from "lucide-react";
import { authApi } from "@/services/api/auth";

const PIN_REVEAL_DURATION_MS = 500;

export default function PinSetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [visiblePin, setVisiblePin] = useState<"pin" | "confirm" | null>(null);
  const hidePinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const revealPin = (field: "pin" | "confirm") => {
    if (hidePinTimer.current) clearTimeout(hidePinTimer.current);
    setVisiblePin(field);
    hidePinTimer.current = setTimeout(
      () => setVisiblePin(null),
      PIN_REVEAL_DURATION_MS,
    );
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d{4,6}$/.test(pin)) return setError("PIN phải gồm 4–6 chữ số");
    if (pin !== confirm) return setError("Hai mã PIN không trùng nhau");
    setSaving(true);
    setError("");
    try {
      await authApi.setTransactionPin(pin);
      await queryClient.fetchQuery({
        queryKey: ["transaction-pin-status"],
        queryFn: authApi.transactionPinStatus,
        staleTime: 0,
      });
      navigate("/setup-face", {
        replace: true,
      });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || "Không thể lưu mã PIN");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-clip bg-[#f5f3ff] flex items-center justify-center p-4">
      {/* Soft background blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-violet-200/50 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] bg-fuchsia-200/40 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] bg-indigo-200/30 rounded-full blur-3xl" />
      </div>

      {/* Decorative wave */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-40 sm:h-52 md:h-64 overflow-hidden opacity-30 select-none"
        aria-hidden="true"
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-20 bg-gradient-to-b from-[#f5f3ff] via-[#f5f3ff]/80 to-transparent" />
        <img
          src="/wave-footer.png"
          alt=""
          className="w-full h-full object-cover object-bottom"
        />
      </div>

      <form
        onSubmit={save}
        className="relative z-10 w-full max-w-md rounded-3xl bg-white p-8 sm:p-10 shadow-xl shadow-violet-100/60 border border-violet-100/80"
      >
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-200">
          <ShieldCheck className="h-9 w-9 text-white" strokeWidth={2} />
        </div>

        <h1 className="text-center text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
          Tạo mã PIN giao dịch
        </h1>
        <p className="mt-3 text-center text-base text-slate-500 leading-relaxed">
          Bạn cần tạo PIN trước khi thực hiện giao dịch chuyển tiền.
        </p>

        {/* Trust note */}
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50/80 p-4 text-left">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
            <Shield className="h-4 w-4 text-violet-600" />
          </div>
          <p className="text-xs leading-relaxed text-violet-700">
            PIN gồm 4–6 chữ số, dùng để xác nhận mỗi lần chuyển tiền. Không chia
            sẻ PIN với bất kỳ ai.
          </p>
        </div>

        {error && (
          <p className="mt-5 rounded-xl bg-red-50 border border-red-100 p-3.5 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        {/* PIN input */}
        <label className="mt-6 block text-sm font-semibold text-slate-700">
          Mã PIN mới
        </label>
        <div className="relative mt-2">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            value={pin}
            onChange={(event) =>
              setPin(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            type={visiblePin === "pin" ? "text" : "password"}
            inputMode="numeric"
            autoComplete="new-password"
            className="w-full rounded-xl border border-transparent bg-slate-50 py-3.5 pl-11 pr-12 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-300 transition-all text-slate-900"
            placeholder="••••••"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => revealPin("pin")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors"
            aria-label="Hiện PIN trong 0.5 giây"
          >
            {visiblePin === "pin" ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Confirm PIN */}
        <label className="mt-5 block text-sm font-semibold text-slate-700">
          Nhập lại mã PIN
        </label>
        <div className="relative mt-2">
          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
          <input
            value={confirm}
            onChange={(event) =>
              setConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            type={visiblePin === "confirm" ? "text" : "password"}
            inputMode="numeric"
            autoComplete="new-password"
            className="w-full rounded-xl border border-transparent bg-slate-50 py-3.5 pl-11 pr-12 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-300 transition-all text-slate-900"
            placeholder="••••••"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => revealPin("confirm")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors"
            aria-label="Hiện PIN xác nhận trong 0.5 giây"
          >
            {visiblePin === "confirm" ? (
              <EyeOff className="h-5 w-5" />
            ) : (
              <Eye className="h-5 w-5" />
            )}
          </button>
        </div>

        {/* Match indicator */}
        {confirm.length >= 4 && (
          <p
            className={`mt-2 text-xs font-medium ${
              pin === confirm ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {pin === confirm ? "✓ Hai mã PIN trùng khớp" : "Hai mã PIN chưa trùng"}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !/^\d{4,6}$/.test(pin) || pin !== confirm}
          className="mt-7 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 font-bold text-white shadow-lg shadow-violet-200 hover:shadow-xl hover:from-violet-700 hover:to-fuchsia-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Đang lưu...
            </>
          ) : (
            "Tạo PIN và tiếp tục"
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="mt-3 w-full rounded-xl bg-slate-100 py-3.5 font-semibold text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại Dashboard
        </button>
      </form>
    </div>
  );
}
