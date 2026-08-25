import { useState } from "react";
import axios from "axios";
import {
  MapPin,
  ShieldCheck,
  LogOut,
  Loader2,
  Navigation,
  Lock,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { authApi } from "@/services/api/auth";
import {
  collectLoginRiskContext,
  LocationPermissionRequiredError,
  markLoginLocationConfirmed,
} from "@/utils/riskTelemetry";
import { useAuthStore } from "@/stores/authStore";

function safeReturnPath(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/confirm-location")
    ? value
    : "/dashboard";
}

/** Required once per account/browser device until that device is confirmed. */
export default function LocationSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const returnTo = safeReturnPath(
    (location.state as { returnTo?: unknown } | null)?.returnTo,
  );

  const confirmLocation = async () => {
    if (!token || !user?.id || saving) return;
    setError("");
    setSaving(true);
    try {
      const clientContext = await collectLoginRiskContext();
      await authApi.recordLoginLocation({ client_context: clientContext });
      if (user?.id) markLoginLocationConfirmed(user.id);
      navigate(returnTo, { replace: true });
    } catch (requestError: unknown) {
      const serverDetail =
        axios.isAxiosError(requestError) &&
        typeof requestError.response?.data?.detail === "string"
          ? requestError.response.data.detail
          : undefined;
      setError(
        requestError instanceof LocationPermissionRequiredError
          ? requestError.message
          : serverDetail || "Không thể xác nhận vị trí. Hãy thử lại.",
      );
    } finally {
      setSaving(false);
    }
  };

  const leave = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-[#f5f3ff] w-full relative overflow-hidden flex items-center justify-center p-4">
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
          style={{ WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 34%, black 100%)", maskImage: "linear-gradient(to bottom, transparent 0%, black 34%, black 100%)" }}
        />
      </div>

      <section className="relative z-10 w-full max-w-md">
        {/* Card */}
        <div className="rounded-3xl bg-white p-8 sm:p-10 text-center shadow-xl shadow-violet-100/60 border border-violet-100/80">
          {/* Icon */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-200">
            <MapPin className="h-9 w-9 text-white" strokeWidth={2} />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Xác nhận vị trí đăng nhập
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-500">
            Để bảo vệ tài khoản khỏi đăng nhập bất thường, hãy cấp vị trí gần
            đúng trước khi tiếp tục.
          </p>

          {/* Privacy note */}
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-violet-100 bg-violet-50/80 p-4 text-left">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100">
              <ShieldCheck className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-900">
                Bảo mật & quyền riêng tư
              </p>
              <p className="mt-1 text-xs leading-relaxed text-violet-700">
                Hệ thống chỉ lưu vị trí đã làm tròn; IP và mã thiết bị được băm
                HMAC, không lưu dạng gốc.
              </p>
            </div>
          </div>

          {/* Extra trust points */}
          <div className="mt-4 grid grid-cols-2 gap-3 text-left">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
              <Navigation className="h-4 w-4 text-violet-500 mb-1.5" />
              <p className="text-xs font-semibold text-slate-800">
                Vị trí gần đúng
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Chỉ cần độ chính xác thành phố
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3.5">
              <Lock className="h-4 w-4 text-violet-500 mb-1.5" />
              <p className="text-xs font-semibold text-slate-800">
                Một lần duy nhất
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                Chỉ yêu cầu trên thiết bị mới
              </p>
            </div>
          </div>

          {error && (
            <p className="mt-5 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-600 text-left">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={() => void confirmLocation()}
            disabled={saving}
            className="mt-7 w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3.5 font-bold text-white shadow-lg shadow-violet-200 hover:shadow-xl hover:from-violet-700 hover:to-fuchsia-700 active:scale-[0.98] transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Đang xác nhận...
              </>
            ) : (
              <>
                <MapPin className="h-5 w-5" />
                Cấp quyền vị trí và tiếp tục
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void leave()}
            disabled={saving}
            className="mt-3 w-full rounded-xl bg-slate-100 py-3.5 font-semibold text-slate-700 hover:bg-slate-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © 2024 Timi. Bảo vệ tài khoản của bạn là ưu tiên hàng đầu.
        </p>
      </section>
    </div>
  );
}
