import { useCallback, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Shield, Mail, Lock, Eye, EyeOff, ArrowLeft, ArrowRight, Sparkles, Globe, Zap } from "lucide-react";
import { authApi } from "@/services/api/auth";
import type {
  DeviceVerificationRequiredResponse,
  GooglePhoneCompletionResponse,
  LoginResponse,
  TokenResponse,
} from "@/services/api/auth";
import { useAuthStore } from "@/stores/authStore";
import DeviceLoginOtpModal from "@/components/auth/DeviceLoginOtpModal";
import GooglePhoneModal from "@/components/auth/GooglePhoneModal";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import { hasGoogleSignInConfig } from "@/components/auth/googleIdentityConfig";
import TimiLogo from "@/components/brand/TimiLogo";
import { getApiErrorMessage } from "@/utils/apiError";
import { getRequiredLoginDeviceId } from "@/utils/riskTelemetry";

const floatingIcons = [
  { Icon: Shield, top: "10%", left: "8%", delay: "0s", size: 28 },
  { Icon: Sparkles, top: "25%", right: "12%", delay: "1.2s", size: 20 },
  { Icon: Globe, top: "60%", right: "8%", delay: "1.8s", size: 22 },
  { Icon: Zap, bottom: "35%", left: "5%", delay: "2.4s", size: 18 },
  { Icon: Lock, top: "40%", left: "20%", delay: "3s", size: 16 },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((s) => s.setAuth);
  const loginState = location.state as {
    registrationEmail?: string;
    returnTo?: unknown;
  } | null;
  const registrationEmail = loginState?.registrationEmail;
  const returnTo = typeof loginState?.returnTo === "string"
    && loginState.returnTo.startsWith("/")
    && !loginState.returnTo.startsWith("//")
    && !loginState.returnTo.startsWith("/login")
    ? loginState.returnTo
    : null;
  const destinationAfterLogin = useCallback((role: string) => (
    role === "admin" ? "/admin" : returnTo ?? "/dashboard"
  ), [returnTo]);
  const [form, setForm] = useState({ email: registrationEmail ?? "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>((): Record<string, string> => (
    new URLSearchParams(location.search).get("reason") === "session-ended"
      ? {
          general: "Phiên đăng nhập không còn hiệu lực hoặc đã hết hạn. Vui lòng đăng nhập lại.",
        }
      : {}
  ));
  const [rememberLogin, setRememberLogin] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [googleCompletion, setGoogleCompletion] = useState<GooglePhoneCompletionResponse | null>(null);
  const [deviceVerification, setDeviceVerification] = useState<DeviceVerificationRequiredResponse | null>(null);
  const rememberLoginRef = useRef<HTMLInputElement>(null);

  const finishAuthenticatedLogin = useCallback((data: TokenResponse) => {
    setAuth(
      data.access_token,
      data.user,
      rememberLogin,
      data.location_confirmation_required,
    );
    navigate(destinationAfterLogin(data.user.role), { replace: true });
  }, [destinationAfterLogin, navigate, rememberLogin, setAuth]);

  const handleLoginResponse = useCallback((data: LoginResponse) => {
    if ("device_verification_required" in data) {
      setGoogleCompletion(null);
      setDeviceVerification(data);
      return;
    }
    finishAuthenticatedLogin(data);
  }, [finishAuthenticatedLogin]);

  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: handleLoginResponse,
    onError: (err: unknown) => {
      setErrors({ password: getApiErrorMessage(err, "Sai email hoặc mật khẩu") });
    },
  });

  const googleLoginMutation = useMutation({
    mutationFn: authApi.loginWithGoogle,
    onSuccess: (data) => {
      if ("requires_phone" in data) {
        setGoogleCompletion(data);
        return;
      }
      handleLoginResponse(data);
    },
    onError: (err: unknown) => {
      setErrors({ general: getApiErrorMessage(err, "Không thể đăng nhập bằng Google") });
    },
  });

  const completeGooglePhoneMutation = useMutation({
    mutationFn: authApi.completeGooglePhone,
    onSuccess: handleLoginResponse,
  });

  const verifyDeviceMutation = useMutation({
    mutationFn: ({ otp }: { otp: string }) => {
      if (!deviceVerification) throw new Error("Thiếu phiên xác minh thiết bị");
      return authApi.verifyLoginDevice({
        verification_token: deviceVerification.verification_token,
        otp,
      });
    },
    onSuccess: (data) => {
      setDeviceVerification(null);
      finishAuthenticatedLogin(data);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const nextErrors: Record<string, string> = {};
    if (!form.email.trim()) nextErrors.email = "Vui lòng nhập email";
    if (!form.password) nextErrors.password = "Vui lòng nhập mật khẩu";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    try {
      loginMutation.mutate({
        ...form,
        device_id: getRequiredLoginDeviceId(),
        remember_me: rememberLogin,
      });
    } catch (error: unknown) {
      setErrors({ general: error instanceof Error ? error.message : "Không thể nhận diện thiết bị đăng nhập" });
    }
  };

  const handleGoogleCredential = useCallback((credential: string) => {
    setErrors({});
    try {
      googleLoginMutation.mutate({
        credential,
        device_id: getRequiredLoginDeviceId(),
        remember_me: rememberLogin,
      });
    } catch (error: unknown) {
      setErrors({ general: error instanceof Error ? error.message : "Không thể nhận diện thiết bị đăng nhập" });
    }
  }, [googleLoginMutation, rememberLogin]);

  const handleGoogleLoadError = useCallback((message: string) => {
    setErrors({ general: message });
  }, []);

  const submitGooglePhone = async (phone: string) => {
    if (!googleCompletion) return;
    await completeGooglePhoneMutation.mutateAsync({
      phone_completion_token: googleCompletion.phone_completion_token,
      phone,
    });
  };

  const inputBase = "w-full pl-12 pr-4 py-4 bg-white/80 backdrop-blur-sm rounded-2xl border text-slate-800 placeholder-slate-400 transition-all duration-300 outline-none";
  const inputNormal = "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-300";
  const inputError = "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 bg-red-50/50";
  return (
    <div className="login-page-shell bg-gradient-to-br from-slate-50 via-white to-blue-50/40 flex w-full relative overflow-x-clip">
      <div className="pointer-events-none absolute inset-0 overflow-clip">
        {/* ===== BACKGROUND EFFECTS ===== */}
        <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-blue-100/50 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-100/40 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-blue-50 to-indigo-50 rounded-full blur-3xl opacity-60" />

        {/* Animated grid pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

        {/* Floating animated icons */}
        {floatingIcons.map(({ Icon, top, left, right, bottom, delay, size }, i) => (
          <div
            key={i}
            className="absolute hidden lg:flex items-center justify-center text-blue-700/55 animate-float"
            style={{ top, left, right, bottom, animationDelay: delay }}
          >
            <Icon size={size} />
          </div>
        ))}
      </div>

      {/* ===== LOGIN CONTENT: LEFT IMAGE + RIGHT FORM ===== */}
      <div className="login-main-content relative z-10 flex min-h-0 w-full flex-1 flex-col lg:flex-row">
      {/* ===== LEFT SIDE - IMAGE ===== */}
      <div className="login-left-column hidden lg:flex lg:w-1/2 relative items-center justify-center p-12">
        <div className="relative w-full max-w-lg">
          {/* Main image card */}
          <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl shadow-blue-200/50 border border-white/50">
            <img
              src="https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80"
              alt="Secure Banking"
              className="login-hero-image w-full h-[580px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/20 to-transparent" />

            {/* Content overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full border border-white/30 mb-4">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-semibold text-white">AI Anti-Scam Protection</span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
                Bảo vệ tài chính<br />với trí tuệ nhân tạo
              </h2>
              <p className="text-slate-200 text-sm leading-relaxed max-w-sm">
                Hệ thống demo phân tích tín hiệu rủi ro và yêu cầu bạn xác nhận trước khi hoàn tất giao dịch.
              </p>
            </div>
          </div>

          {/* Floating security card */}
          <div className="absolute -top-6 -right-6 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-5 animate-float-slow">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Shield className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-medium">Đăng nhập thiết bị mới</p>
                <p className="text-base font-bold text-slate-900">OTP + vị trí</p>
              </div>
            </div>
          </div>

          {/* Floating session card */}
          <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-4 animate-float-slow" style={{ animationDelay: "1.5s" }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">Một phiên đăng nhập</p>
                <p className="text-xs text-slate-400">Thiết bị cũ tự hết hiệu lực</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== RIGHT SIDE - FORM ===== */}
      <div className="login-form-column flex-1 flex flex-col items-center justify-center px-6 py-12 lg:py-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-blue-600">
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </Link>
          {/* Logo */}
          <div className="login-brand flex items-center gap-3 mb-8 lg:mb-4 justify-center lg:justify-start">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center">
              <TimiLogo className="h-full w-full rounded-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Timi</h1>
              <p className="text-xs text-slate-400 font-medium">AI Financial Guardian</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="login-card bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 border border-white/60 p-8 space-y-6 lg:p-6 lg:space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Chào mừng trở lại</h2>
              <p className="text-sm text-slate-400">Đăng nhập để tiếp tục quản lý tài chính</p>
            </div>

            {errors.general && (
              <div className="rounded-xl bg-red-50/80 backdrop-blur-sm p-4 text-sm text-red-600 border border-red-200/60 flex items-center gap-2 animate-shake">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                {errors.general}
              </div>
            )}

            {registrationEmail && !errors.general && (
              <div className="rounded-xl bg-emerald-50/80 backdrop-blur-sm p-4 text-sm text-emerald-700 border border-emerald-200/60 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                Đăng ký tài khoản thành công. Hãy sử dụng email vừa đăng ký để đăng nhập.
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form-fields space-y-5 lg:space-y-4">
              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                <div className="relative group">
                  <Mail strokeWidth={2} className="auth-form-icon absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="name@gmail.com"
                    className={`${inputBase} ${errors.email || errors.general ? inputError : inputNormal}`}
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setErrors((current) => ({ ...current, email: "" }));
                    }}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => {
                      setFocusedField(null);
                      if (!form.email.trim()) setErrors((current) => ({ ...current, email: "Vui lòng nhập email" }));
                    }}
                  />
                  <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ${focusedField === "email" ? "opacity-100" : "opacity-0"}`} />
                </div>
                {errors.email && <p className="ml-1 text-xs text-red-500">{errors.email}</p>}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Mật khẩu</label>
                <div className="relative group">
                  <Lock strokeWidth={2} className="auth-form-icon absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2" />
                  <input
                    type={showPass ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={`${inputBase} pr-12 ${errors.password || errors.general ? inputError : inputNormal}`}
                    value={form.password}
                    onChange={(e) => {
                      setForm({ ...form, password: e.target.value });
                      setErrors((current) => ({ ...current, password: "" }));
                    }}
                    onFocus={() => setFocusedField("password")}
                    onKeyDown={(event) => {
                      if (event.key === "Tab" && !event.shiftKey) {
                        event.preventDefault();
                        rememberLoginRef.current?.focus();
                      }
                    }}
                    onBlur={() => {
                      setFocusedField(null);
                      if (!form.password) setErrors((current) => ({ ...current, password: "Vui lòng nhập mật khẩu" }));
                    }}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 transition-colors p-1"
                  >
                    {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                  <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ${focusedField === "password" ? "opacity-100" : "opacity-0"}`} />
                </div>
                {errors.password && <p className="ml-1 text-xs text-red-500">{errors.password}</p>}
              </div>

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative">
                    <input ref={rememberLoginRef} type="checkbox" tabIndex={0} aria-label="Ghi nhớ đăng nhập" className="peer sr-only" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} />
                    <div className="w-4 h-4 rounded border-2 border-slate-300 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all" />
                    <svg className="absolute top-0.5 left-0.5 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <span className="text-slate-500 group-hover:text-slate-700 transition-colors">Ghi nhớ đăng nhập</span>
                </label>
                <Link to="/forgot-password" className="text-blue-600 font-semibold hover:text-blue-700 transition-colors">
                  Quên mật khẩu?
                </Link>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full py-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white font-bold rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
              >
                {loginMutation.isPending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Đang đăng nhập...
                  </>
                ) : (
                  <>
                    Đăng nhập
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>

              {/* Divider */}
              <div className="relative flex items-center gap-4 py-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">hoặc tiếp tục với</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />
              </div>

              {hasGoogleSignInConfig() && (
                <GoogleSignInButton
                  disabled={googleLoginMutation.isPending || completeGooglePhoneMutation.isPending}
                  isLoading={googleLoginMutation.isPending || completeGooglePhoneMutation.isPending}
                  onCredential={handleGoogleCredential}
                  onLoadError={handleGoogleLoadError}
                />
              )}
            </form>

            {/* Register link */}
            <p className="text-center text-sm text-slate-500">
              Chưa có tài khoản?{" "}
              <Link to="/register" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">
                Tạo tài khoản thử nghiệm
              </Link>
            </p>
          </div>

          {/* Footer */}
          <p className="login-footer text-center text-xs text-slate-400 mt-8 lg:mt-4">
            © 2026 Timi. Bản demo AI Financial Guardian.
          </p>
        </div>
      </div>
      </div>

      {googleCompletion && (
        <GooglePhoneModal
          email={googleCompletion.email}
          fullName={googleCompletion.full_name}
          isSaving={completeGooglePhoneMutation.isPending}
          onCancel={() => setGoogleCompletion(null)}
          onSubmit={submitGooglePhone}
        />
      )}

      {deviceVerification && (
        <DeviceLoginOtpModal
          email={deviceVerification.email}
          expiresInSeconds={deviceVerification.expires_in_seconds}
          isSaving={verifyDeviceMutation.isPending}
          onCancel={() => setDeviceVerification(null)}
          onSubmit={(otp) => verifyDeviceMutation.mutateAsync({ otp }).then(() => undefined)}
        />
      )}

      {/* Animations */}
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-15px); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-float-slow { animation: float-slow 5s ease-in-out infinite; }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </div>
  );
}
