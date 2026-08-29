import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { Shield, Mail, Lock, User, Eye, EyeOff, Phone, ArrowLeft, ArrowRight, Sparkles, Fingerprint, Globe, Zap, CheckCircle2, Check } from "lucide-react";
import { authApi } from "@/services/api/auth";
import TimiLogo from "@/components/brand/TimiLogo";

const floatingIcons = [
  { Icon: Shield, top: "8%", left: "10%", delay: "0s", size: 28 },
  { Icon: Sparkles, top: "20%", right: "10%", delay: "1.5s", size: 20 },
  { Icon: Fingerprint, bottom: "25%", left: "12%", delay: "0.8s", size: 24 },
  { Icon: Globe, top: "55%", right: "8%", delay: "2s", size: 22 },
  { Icon: Zap, bottom: "40%", left: "6%", delay: "2.8s", size: 18 },
  { Icon: Lock, top: "45%", left: "18%", delay: "3.5s", size: 16 },
];

const benefits = [
  "Bảo vệ AI 24/7",
  "Chuyển tiền siêu tốc",
  "Không phí ẩn",
];

function getPasswordRuleError(password: string): string | null {
  const missingRules = [
    password.length < 8 ? "ít nhất 8 ký tự" : "",
    !/[A-Z]/.test(password) ? "1 chữ hoa" : "",
    !/[a-z]/.test(password) ? "1 chữ thường" : "",
    !/[^A-Za-z0-9]/.test(password) ? "1 ký tự đặc biệt" : "",
    !/\d/.test(password) ? "1 chữ số" : "",
  ].filter(Boolean);
  return missingRules.length > 0
    ? `Mật khẩu còn thiếu: ${missingRules.join(", ")}.`
    : null;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const passwordRuleMessage = "Mật khẩu cần có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.";

  const registerMutation = useMutation({
    mutationFn: authApi.requestRegisterOtp,
    onSuccess: () => {
      setOtpSent(true);
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      if (detail && typeof detail === "object" && !Array.isArray(detail)) {
        setErrors((current) => ({
          ...current,
          ...(typeof detail.email === "string" ? { email: detail.email } : {}),
          ...(typeof detail.phone === "string" ? { phone: detail.phone } : {}),
        }));
        return;
      }
      const translateValidationMessage = (value: string) => {
        if (/valid email address|special-use|reserved name/i.test(value)) {
          return "Địa chỉ email không hợp lệ. Vui lòng sử dụng email thật, ví dụ: tenban@gmail.com.";
        }
        return value;
      };
      const message = Array.isArray(detail)
        ? detail.map((item: unknown) => {
            if (typeof item === "string") return translateValidationMessage(item);
            if (item && typeof item === "object" && "msg" in item) {
              return translateValidationMessage(String((item as { msg: unknown }).msg));
            }
            return "Dữ liệu đăng ký không hợp lệ";
          }).join("; ")
        : typeof detail === "string" ? translateValidationMessage(detail) : "Đăng ký thất bại";
      setErrors({ general: message });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: authApi.verifyRegisterOtp,
    onSuccess: () => navigate("/login", { replace: true, state: { registrationEmail: form.email } }),
    onError: (err: any) => setErrors({ general: err.response?.data?.detail || "Mã xác minh không hợp lệ" }),
  });

  const checkAvailability = async (field: "email" | "phone") => {
    const value = form[field];
    if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
    if (field === "phone" && !/^\d{10}$/.test(value)) return;
    setCheckingAvailability(true);
    try {
      const result = await authApi.checkRegisterAvailability({ [field]: value });
      if (field === "email") setEmailAvailable(result.email_available);
      setErrors((current) => {
        const next = { ...current };
        const message = result[`${field}_message` as "email_message" | "phone_message"];
        if (message) next[field] = message;
        else delete next[field];
        return next;
      });
    } catch {
      if (field === "email") setEmailAvailable(null);
      setErrors((current) => ({
        ...current,
        [field]: "Chưa thể kiểm tra dữ liệu lúc này. Vui lòng thử lại.",
      }));
    } finally {
      setCheckingAvailability(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    if (otpSent) {
      if (!/^\d{6}$/.test(otp)) {
        setErrors({ general: "Vui lòng nhập đúng mã xác minh 6 chữ số." });
        return;
      }
      verifyMutation.mutate({ email: form.email, otp });
      return;
    }
    const passwordError = getPasswordRuleError(form.password);
    if (passwordError) {
      setErrors({ password: passwordError });
      return;
    }
    if (form.password.length < 8) {
      setErrors({ password: "Mật khẩu ít nhất 8 ký tự" });
      return;
    }
    if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/[^A-Za-z0-9]/.test(form.password) || !/\d/.test(form.password)) {
      setErrors({ password: passwordRuleMessage });
      return;
    }
    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: "Mật khẩu không khớp" });
      return;
    }
    if (!/^\d{10}$/.test(form.phone)) {
      setErrors({ phone: "Số điện thoại phải gồm đúng 10 chữ số; đây cũng là số tài khoản Timi Bank." });
      return;
    }
    if (!agreed) {
      setErrors({ general: "Vui lòng đồng ý với điều khoản sử dụng" });
      return;
    }
    const { confirmPassword, ...payload } = form;
    registerMutation.mutate(payload);
  };

  const updateOtpDigit = (index: number, value: string) => {
    const cleanValue = value.replace(/\D/g, "");
    if (cleanValue.length > 1) {
      const pasted = cleanValue.slice(0, 6);
      setOtp(pasted);
      otpInputRefs.current[Math.min(index + pasted.length, 6) - 1]?.focus();
      return;
    }
    const digit = cleanValue.slice(-1);
    const digits = otp.padEnd(6, "").split("");
    digits[index] = digit;
    setOtp(digits.join("").slice(0, 6));
    if (digit && index < 5) otpInputRefs.current[index + 1]?.focus();
  };

  const pasteOtp = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    setOtp(pasted);
    otpInputRefs.current[Math.min(pasted.length, 6) - 1]?.focus();
  };

  const inputBase = "w-full pl-12 pr-4 py-4 bg-white/80 backdrop-blur-sm rounded-2xl border text-slate-800 placeholder-slate-400 transition-all duration-300 outline-none";
  const inputNormal = "border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 hover:border-slate-300";
  const inputError = "border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 bg-red-50/50";
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50/40 flex w-full relative overflow-x-clip">
      {/* ===== BACKGROUND EFFECTS ===== */}
      <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-blue-100/50 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-indigo-100/40 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-blue-50 to-indigo-50 rounded-full blur-3xl opacity-60" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(59,130,246,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />

      {/* Floating icons */}
      {floatingIcons.map(({ Icon, top, left, right, bottom, delay, size }, i) => (
        <div key={i} className="absolute hidden lg:flex items-center justify-center text-blue-700/55 animate-float" style={{ top, left, right, bottom, animationDelay: delay }}>
          <Icon size={size} />
        </div>
      ))}

      {/* ===== LEFT SIDE - IMAGE ===== */}
      <div className="hidden lg:flex lg:w-1/2 relative items-center justify-center p-12">
        <div className="relative w-full max-w-lg">
          <div className="relative rounded-[2.5rem] overflow-hidden shadow-2xl shadow-blue-200/50 border border-white/50">
            <img
              src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&q=80"
              alt="Team Collaboration"
              className="w-full h-[620px] object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-slate-900/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/20 backdrop-blur-md rounded-full border border-white/30 mb-4">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold text-white">Miễn phí trọn đời</span>
              </div>
              <h2 className="text-3xl font-bold text-white mb-3 leading-tight">
                Bắt đầu hành trình<br />tài chính thông minh
              </h2>
              <p className="text-slate-200 text-sm leading-relaxed max-w-sm">
                Tham gia cùng 2 triệu+ người dùng đang được Timi bảo vệ mỗi ngày. Đăng ký chỉ mất 30 giây.
              </p>
            </div>
          </div>

          {/* Benefits card */}
          <div className="absolute -top-6 -right-6 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-5 animate-float-slow">
            <div className="space-y-3">
              {benefits.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-700">{b}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stats card */}
          <div className="absolute -bottom-4 -left-4 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 p-4 animate-float-slow" style={{ animationDelay: "1.5s" }}>
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&crop=face" className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="" />
                <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face" className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="" />
                <img src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face" className="w-8 h-8 rounded-full border-2 border-white object-cover" alt="" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">2M+ Users</p>
                <p className="text-xs text-slate-400">Trust Timi</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== RIGHT SIDE - FORM ===== */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative z-10">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-blue-600">
            <ArrowLeft className="h-4 w-4" />
            Về trang chủ
          </Link>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8 justify-center lg:justify-start">
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center">
              <TimiLogo className="h-full w-full rounded-2xl" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Timi</h1>
              <p className="text-xs text-slate-400 font-medium">AI Financial Guardian</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white/70 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 border border-white/60 p-8 space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Tạo tài khoản</h2>
              <p className="text-sm text-slate-400">Đăng ký miễn phí, chỉ mất 30 giây</p>
            </div>

            {errors.general && (
              <div className="rounded-xl bg-red-50/80 backdrop-blur-sm p-4 text-sm text-red-600 border border-red-200/60 flex items-center gap-2 animate-shake">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
                {errors.general}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Họ và tên</label>
                <div className="relative group">
                  <User strokeWidth={2} className="auth-form-icon absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Nguyễn Văn A"
                    className={`${inputBase} ${errors.full_name ? inputError : inputNormal}`}
                    value={form.full_name}
                    onChange={(e) => {
                      setForm({ ...form, full_name: e.target.value });
                      setErrors((current) => ({ ...current, full_name: "" }));
                    }}
                    onFocus={() => setFocusedField("full_name")}
                    onBlur={() => {
                      setFocusedField(null);
                      if (!form.full_name.trim()) setErrors((current) => ({ ...current, full_name: "Vui lòng nhập họ và tên" }));
                    }}
                  />
                  <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ${focusedField === "full_name" ? "opacity-100" : "opacity-0"}`} />
                </div>
                {errors.full_name && <p className="ml-1 text-xs text-red-500">{errors.full_name}</p>}
              </div>

              {/* Phone */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Số điện thoại</label>
                <div className="relative group">
                  <Phone strokeWidth={2} className="auth-form-icon absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2" />
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    maxLength={10}
                    placeholder="0901234567"
                    className={`${inputBase} ${errors.phone ? inputError : inputNormal}`}
                    value={form.phone}
                    onChange={(e) => {
                      setForm({ ...form, phone: e.target.value.replace(/\D/g, "").slice(0, 10) });
                      setErrors((current) => ({ ...current, phone: "" }));
                    }}
                    onFocus={() => setFocusedField("phone")}
                    onBlur={() => {
                      setFocusedField(null);
                      if (!form.phone) {
                        setErrors((current) => ({ ...current, phone: "Vui lòng nhập số điện thoại" }));
                        return;
                      }
                      void checkAvailability("phone");
                    }}
                  />
                  <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ${focusedField === "phone" ? "opacity-100" : "opacity-0"}`} />
                </div>
                {errors.phone && <p className="text-xs text-red-500 ml-1">{errors.phone}</p>}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Email</label>
                <div className="relative group">
                  <Mail strokeWidth={2} className="auth-form-icon absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2" />
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="name@gmail.com"
                    className={`${inputBase} pr-32 ${errors.email || errors.general ? inputError : inputNormal}`}
                    value={form.email}
                    onChange={(e) => {
                      setForm({ ...form, email: e.target.value });
                      setEmailAvailable(null);
                      setErrors((current) => ({ ...current, email: "" }));
                    }}
                    onFocus={() => setFocusedField("email")}
                    onBlur={() => {
                      setFocusedField(null);
                      if (!form.email.trim()) {
                        setEmailAvailable(null);
                        setErrors((current) => ({ ...current, email: "Vui lòng nhập email" }));
                        return;
                      }
                      void checkAvailability("email");
                    }}
                  />
                  <button
                    type="submit"
                    disabled={emailAvailable !== true || otpSent || registerMutation.isPending || verifyMutation.isPending || checkingAvailability}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-3 py-2 text-xs font-bold text-white shadow-sm transition-colors ${emailAvailable === true && !otpSent ? "bg-blue-600 hover:bg-blue-700" : "cursor-not-allowed bg-slate-400"}`}
                  >
                    {otpSent ? "Đã gửi mã" : "Gửi mã"}
                  </button>
                  <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ${focusedField === "email" ? "opacity-100" : "opacity-0"}`} />
                </div>
                {errors.email && <p className="ml-1 text-xs text-red-500">{errors.email}</p>}
                {otpSent && (
                  <div className="mt-2 space-y-1.5 [&>label]:hidden">
                    <div className="grid grid-cols-6 gap-2" role="group" aria-label="Mã xác minh email gồm 6 chữ số">
                      {Array.from({ length: 6 }, (_, index) => (
                        <input
                          key={index}
                          ref={(element) => { otpInputRefs.current[index] = element; }}
                          type="text"
                          inputMode="numeric"
                          autoComplete={index === 0 ? "one-time-code" : "off"}
                          maxLength={1}
                          value={otp[index] || ""}
                          onChange={(event) => updateOtpDigit(index, event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Backspace" && !otp[index] && index > 0) {
                              event.preventDefault();
                              otpInputRefs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowLeft" && index > 0) {
                              event.preventDefault();
                              otpInputRefs.current[index - 1]?.focus();
                            } else if (event.key === "ArrowRight" && index < 5) {
                              event.preventDefault();
                              otpInputRefs.current[index + 1]?.focus();
                            }
                          }}
                          onPaste={pasteOtp}
                          aria-label={`Chữ số thứ ${index + 1}`}
                          className={`h-14 w-full rounded-xl border bg-white/80 text-center text-xl font-semibold text-slate-800 outline-none transition-all ${errors.general ? inputError : inputNormal}`}
                          autoFocus={index === 0}
                        />
                      ))}
                    </div>
                    <p className="ml-1 text-xs text-slate-400">Nhập 6 chữ số đã gửi về Gmail</p>
                    <label className="ml-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Mã xác minh email</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={otp}
                      onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="Nhập mã 6 số đã gửi về Gmail"
                      className={`hidden ${inputBase} text-center tracking-[0.4em] ${errors.general ? inputError : inputNormal}`}
                    />
                  </div>
                )}
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Mật khẩu</label>
                <div className="relative group">
                  <Lock strokeWidth={2} className="auth-form-icon absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2" />
                  <input
                    type={showPass ? "text" : "password"}
                    placeholder="Ít nhất 8 ký tự"
                    className={`${inputBase} pr-12 ${errors.password ? inputError : inputNormal}`}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    onFocus={() => setFocusedField("password")}
                    onBlur={() => {
                      setFocusedField(null);
                      const passwordError = getPasswordRuleError(form.password);
                      setErrors((current) => {
                        const next = { ...current };
                        if (passwordError) next.password = passwordError;
                        else delete next.password;
                        return next;
                      });
                    }}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowPass(!showPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 transition-colors p-1">
                    {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                  <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ${focusedField === "password" ? "opacity-100" : "opacity-0"}`} />
                </div>
                {!errors.password && <p className="ml-1 text-xs text-slate-400">Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ký tự đặc biệt.</p>}
                {errors.password && <p className="text-xs text-red-500 ml-1">{errors.password}</p>}
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider ml-1">Xác nhận mật khẩu</label>
                <div className="relative group">
                  <Lock strokeWidth={2} className="auth-form-icon absolute left-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2" />
                  <input
                    type={showConfirmPass ? "text" : "password"}
                    placeholder="Nhập lại mật khẩu"
                    className={`${inputBase} pr-12 ${errors.confirmPassword ? inputError : inputNormal}`}
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    onFocus={() => setFocusedField("confirm")}
                    onBlur={() => {
                      setFocusedField(null);
                      setErrors((current) => {
                        const next = { ...current };
                        if (!form.confirmPassword) {
                          next.confirmPassword = "Vui lòng nhập lại mật khẩu";
                        } else if (form.password !== form.confirmPassword) {
                          next.confirmPassword = "Mật khẩu không khớp";
                        } else {
                          delete next.confirmPassword;
                        }
                        return next;
                      });
                    }}
                  />
                  <button type="button" tabIndex={-1} onClick={() => setShowConfirmPass(!showConfirmPass)} className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 transition-colors p-1" aria-label={showConfirmPass ? "Ẩn mật khẩu xác nhận" : "Hiện mật khẩu xác nhận"}>
                    {showConfirmPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                  <div className={`absolute bottom-0 left-4 right-4 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300 ${focusedField === "confirm" ? "opacity-100" : "opacity-0"}`} />
                </div>
                {errors.confirmPassword && <p className="text-xs text-red-500 ml-1">{errors.confirmPassword}</p>}
              </div>

              {/* Terms */}
              <label htmlFor="terms-agreement" className="flex items-start gap-3 cursor-pointer group">
                <div className="relative mt-0.5">
                  <input
                    id="terms-agreement"
                    type="checkbox"
                    className="peer sr-only"
                    checked={agreed}
                    aria-invalid={Boolean(errors.general && !agreed)}
                    onChange={(e) => {
                      setAgreed(e.target.checked);
                      if (e.target.checked && errors.general) {
                        setErrors({});
                      }
                    }}
                  />
                  <div className="w-5 h-5 rounded-lg border-2 border-slate-300 peer-checked:bg-blue-600 peer-checked:border-blue-600 transition-all flex items-center justify-center">
                    {agreed && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                  </div>
                </div>
                <span className="text-sm text-slate-500 leading-relaxed">
                  Tôi đồng ý với{" "}
                  <Link to="/terms" className="text-blue-600 font-semibold hover:underline">Điều khoản sử dụng</Link>
                  {" "}và{" "}
                  <Link to="/privacy" className="text-blue-600 font-semibold hover:underline">Chính sách bảo mật</Link>
                </span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={registerMutation.isPending || verifyMutation.isPending}
                className="w-full py-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white font-bold rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 group mt-2"
              >
                {registerMutation.isPending || verifyMutation.isPending ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {otpSent ? "Đang xác minh..." : "Đang gửi mã..."}
                  </>
                ) : (
                  <>
                    Đăng ký tài khoản
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Login link */}
            <p className="text-center text-sm text-slate-500">
              Đã có tài khoản?{" "}
              <Link to="/login" className="text-blue-600 font-bold hover:text-blue-700 transition-colors">
                Đăng nhập ngay
              </Link>
            </p>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-slate-400 mt-8">
            © 2026 Timi. Bảo vệ bạn mọi lúc.
          </p>
        </div>
      </div>

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
