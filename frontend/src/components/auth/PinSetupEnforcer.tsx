import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, LayoutDashboard, ShieldAlert } from "lucide-react";

import { authApi } from "@/services/api/auth";
import { useAuthStore } from "@/stores/authStore";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/** Keep signed-in accounts on the required PIN/Face ID setup flow. */
export default function PinSetupEnforcer() {
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissedPath, setDismissedPath] = useState<string | null>(null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const pinStatus = useQuery({
    queryKey: ["transaction-pin-status"],
    queryFn: authApi.transactionPinStatus,
    enabled: isAuthenticated,
    staleTime: 0,
    retry: false,
  });
  const faceStatus = useQuery({
    queryKey: ["face-enrollment-status"],
    queryFn: authApi.faceEnrollmentStatus,
    enabled: isAuthenticated,
    staleTime: 0,
    retry: false,
  });

  const isCheckingSetup =
    !isAuthenticated
    || !pinStatus.isSuccess
    || pinStatus.isFetching
    || !faceStatus.isSuccess
    || faceStatus.isFetching;
  const needsPin = pinStatus.isSuccess && !pinStatus.data.configured;
  const needsFace =
    pinStatus.isSuccess
    && pinStatus.data.configured
    && faceStatus.isSuccess
    && !faceStatus.data.configured;
  const canShowSetupNotice =
    location.pathname !== "/confirm-location"
    && dismissedPath !== location.pathname;
  const isOnRequiredSetupPage =
    (needsPin && location.pathname === "/setup-pin")
    || (needsFace && location.pathname === "/setup-face");
  const shouldShowNotice =
    !isCheckingSetup
    && canShowSetupNotice
    && !isOnRequiredSetupPage
    && (needsPin || needsFace);

  useBodyScrollLock(shouldShowNotice, location.pathname);

  if (!shouldShowNotice) return null;

  const setupPinFirst = needsPin;
  return createPortal(
    <div className="fixed inset-0 z-[9998] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-4 w-full max-w-md rounded-3xl border border-violet-100 bg-white p-7 text-center shadow-2xl shadow-violet-950/20">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="mt-5 text-xl font-bold text-slate-900">
          Cần hoàn tất thiết lập bảo mật
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {setupPinFirst
            ? "Bạn chưa thiết lập mã PIN giao dịch. Vui lòng thiết lập PIN trước khi xác thực khuôn mặt."
            : "Bạn chưa thiết lập khuôn mặt. Vui lòng xác thực khuôn mặt để hoàn tất bảo mật tài khoản."}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate(setupPinFirst ? "/setup-pin" : "/setup-face")}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-violet-200 transition hover:shadow-xl"
          >
            {setupPinFirst ? "Thiết lập mã PIN" : "Thiết lập khuôn mặt"}
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDismissedPath("/dashboard");
              navigate("/dashboard", { replace: true });
            }}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3.5 font-semibold text-slate-700 transition hover:bg-slate-200"
          >
            <LayoutDashboard className="h-4 w-4" />
            Về Dashboard
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
