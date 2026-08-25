import { Navigate, useLocation } from "react-router-dom";

import { hasConfirmedLoginLocation } from "@/utils/riskTelemetry";
import { useAuthStore } from "@/stores/authStore";

/** Keep the app behind the required post-login location setup screen. */
export default function LocationRequiredRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, token, user } = useAuthStore();

  if (
    isAuthenticated
    && token
    && location.pathname !== "/confirm-location"
    && (!user?.id || !hasConfirmedLoginLocation(user.id))
  ) {
    return (
      <Navigate
        to="/confirm-location"
        replace
        state={{ returnTo: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }
  return <>{children}</>;
}
