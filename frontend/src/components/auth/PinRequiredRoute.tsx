import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet } from "react-router-dom";

import { authApi } from "@/services/api/auth";

/** Require a transaction PIN before entering money-related pages. */
export default function PinRequiredRoute() {
  const pinStatus = useQuery({
    queryKey: ["transaction-pin-status"],
    queryFn: authApi.transactionPinStatus,
    staleTime: 30_000,
  });

  if (pinStatus.isLoading) {
    return <div className="p-8 text-center text-sm text-slate-500">Đang kiểm tra bảo mật...</div>;
  }
  if (pinStatus.isError || !pinStatus.data?.configured) {
    return <Navigate to="/setup-pin" replace />;
  }
  return <Outlet />;
}
