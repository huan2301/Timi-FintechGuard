import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import {
  Shield,
  Mail,
  Lock,
  KeyRound,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { authApi } from "@/services/api/auth";
import TimiLogo from "@/components/brand/TimiLogo";
import { getApiErrorMessage } from "@/utils/apiError";

type Step = "email" | "otp" | "done";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const requestOtp = useMutation({
    mutationFn: () => authApi.forgotPassword(email.trim().toLowerCase()),
    onSuccess: (res) => {
      setError("");
      setInfo(
        res.data?.message ||
          "Nếu email tồn tại, mã OTP đã được gửi. Kiểm tra hộp thư và Spam.",
      );
      setStep("otp");
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, "Không gửi được OTP. Thử lại sau."));
    },
  });

  const resetPw = useMutation({
    mutationFn: () =>
      authApi.resetPassword({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
        new_password: password,
      }),
    onSuccess: () => {
      setError("");
      setStep("done");
    },
    onError: (err: unknown) => {
      setError(getApiErrorMessage(err, "Đặt lại mật khẩu thất bại."));
    },
  });

  const handleRequestOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Vui lòng nhập email đã đăng ký.");
      return;
    }
    requestOtp.mutate();
  };

  const handleReset = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{4,8}$/.test(otp.trim())) {
      setError("OTP không hợp lệ.");
      return;
    }
    if (password.length < 8) {
      setError("Mật khẩu mới tối thiểu 8 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Xác nhận mật khẩu không khớp.");
      return;
    }
    resetPw.mutate();
  };

  const inputBase =
    "w-full pl-12 pr-4 py-4 bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200 text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10";

  return (
    <div className="relative flex min-h-screen w-full items-start justify-center overflow-x-clip bg-gradient-to-br from-slate-50 via-white to-blue-50/40 px-6 py-12 sm:items-center">
      <div className="absolute right-0 top-0 h-[500px] w-[500px] -translate-y-1/3 translate-x-1/4 rounded-full bg-blue-100/50 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-[400px] w-[400px] -translate-x-1/4 translate-y-1/3 rounded-full bg-indigo-100/40 blur-3xl" />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl">
            <TimiLogo className="h-full w-full rounded-2xl" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Timi
            </h1>
            <p className="text-xs font-medium text-slate-400">
              AI Financial Guardian
            </p>
          </div>
        </div>

        <div className="space-y-6 rounded-3xl border border-white/60 bg-white/70 p-8 shadow-xl shadow-slate-200/50 backdrop-blur-xl">
          {step !== "done" && (
            <div>
              <h2 className="mb-1 text-2xl font-bold text-slate-900">
                Quên mật khẩu
              </h2>
              <p className="text-sm text-slate-400">
                {step === "email"
                  ? "Nhập email đã đăng ký để nhận mã OTP."
                  : "Nhập OTP trong email và mật khẩu mới."}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200/60 bg-red-50/80 p-4 text-sm text-red-600">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
              {error}
            </div>
          )}

          {info && step === "otp" && !error && (
            <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/80 p-4 text-sm text-emerald-700">
              {info}
            </div>
          )}

          {step === "email" && (
            <form onSubmit={handleRequestOtp} className="space-y-5">
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    className={inputBase}
                    placeholder="name@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={requestOtp.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 py-4 font-bold text-white shadow-xl shadow-slate-200 transition active:scale-[0.98] disabled:opacity-70"
              >
                {requestOtp.isPending ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Đang gửi OTP...
                  </>
                ) : (
                  <>
                    Gửi mã OTP
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={handleReset} className="space-y-5">
              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Mã OTP
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    className={`${inputBase} tracking-[0.35em]`}
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) =>
                      setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))
                    }
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Mật khẩu mới
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPass ? "text" : "password"}
                    className={`${inputBase} pr-12`}
                    placeholder="Tối thiểu 8 ký tự"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    tabIndex={-1}
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    {showPass ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Xác nhận mật khẩu
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPass ? "text" : "password"}
                    className={inputBase}
                    placeholder="Nhập lại mật khẩu"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={resetPw.isPending}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 py-4 font-bold text-white shadow-xl shadow-slate-200 transition active:scale-[0.98] disabled:opacity-70"
              >
                {resetPw.isPending ? "Đang xử lý..." : "Đặt lại mật khẩu"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setError("");
                  requestOtp.mutate();
                }}
                disabled={requestOtp.isPending}
                className="w-full text-center text-sm font-semibold text-blue-600 hover:text-blue-700"
              >
                Gửi lại OTP
              </button>
            </form>
          )}

          {step === "done" && (
            <div className="py-4 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                <Shield className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Đặt lại thành công
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Bạn có thể đăng nhập bằng mật khẩu mới.
              </p>
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true })}
                className="mt-6 w-full rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 py-4 font-bold text-white"
              >
                Về trang đăng nhập
              </button>
            </div>
          )}

          {step !== "done" && (
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại đăng nhập
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
