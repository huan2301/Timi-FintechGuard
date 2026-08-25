import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Shield, ScanFace, CheckCircle2 } from "lucide-react";
import { authApi } from "@/services/api/auth";
import FaceVerificationModal, {
  type FaceMatchResult,
} from "@/components/auth/FaceVerificationModal";
import { useAuthStore } from "@/stores/authStore";

export default function FaceEnrollmentPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [isEnrolling, setIsEnrolling] = useState(false);

  const enroll = async (imageData: string | string[]): Promise<FaceMatchResult> => {
    setIsEnrolling(true);
    try {
      return await authApi.enrollFace(imageData);
    } finally {
      setIsEnrolling(false);
    }
  };

  const completeEnrollment = () => {
    // PinSetupEnforcer keeps this status in React Query.  Mark it as configured
    // immediately after the enrollment request succeeds so a stale `false`
    // value cannot reopen the setup notice on the next route.
    queryClient.setQueryData(["face-enrollment-status"], { configured: true });
    void queryClient.invalidateQueries({ queryKey: ["account-overview"] });
    navigate(user?.role === "admin" ? "/admin" : "/dashboard", {
      replace: true,
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f3ff] w-full relative overflow-x-clip">
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
          style={{
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 34%, black 100%)",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 34%, black 100%)",
          }}
        />
      </div>

      {/* Subtle background content (visible if modal is transparent / delayed) */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 pointer-events-none">
        <div className="w-full max-w-md text-center opacity-60">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-200">
            <ScanFace className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            Đăng ký khuôn mặt
          </h1>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Xác thực khuôn mặt giúp bảo vệ giao dịch chuyển tiền an toàn hơn.
          </p>
          <div className="mt-6 flex flex-col gap-2.5 text-left">
            {[
              "Chỉ dùng để xác minh danh tính khi giao dịch",
              "Dữ liệu khuôn mặt được mã hóa an toàn",
              "Bạn có thể cập nhật lại bất cứ lúc nào",
            ].map((text) => (
              <div
                key={text}
                className="flex items-start gap-2.5 rounded-xl bg-white/70 border border-violet-100 px-4 py-3"
              >
                <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0 mt-0.5" />
                <span className="text-xs text-slate-600">{text}</span>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Shield className="w-3.5 h-3.5 text-violet-400" />
            Được bảo vệ bởi Timi Security
          </div>
        </div>
      </div>

      {/* Modal — logic & UI gốc giữ nguyên */}
      <FaceVerificationModal
        onVerified={enroll}
        onVerificationComplete={completeEnrollment}
        onCancel={() => navigate("/dashboard", { replace: true })}
        isLoading={isEnrolling}
        mode="enrollment"
      />
    </div>
  );
}
