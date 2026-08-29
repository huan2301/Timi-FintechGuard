import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, lazy, Suspense } from "react";
import { useAuthStore } from "@/stores/authStore";
import PageTransition from "@/components/transitions/PageTransition";

import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import ForgotPasswordPage from "@/pages/auth/ForgotPasswordPage";
import HomePage from "@/pages/public/HomePage";
import LegalPage from "@/pages/public/LegalPage";
import MissionPage from "@/pages/public/MissionPage";
import MainLayout from "@/components/layout/MainLayout";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import LocationRequiredRoute from "@/components/auth/LocationRequiredRoute";
import { parsePaymentQrSearch } from "@/utils/paymentQr";

const DashboardPage = lazy(() => import("@/pages/finance/DashboardPage"));
const TransferPage = lazy(() => import("@/pages/finance/TransferPage"));
const HistoryPage = lazy(() => import("@/pages/finance/HistoryPage"));
const AdminPage = lazy(() => import("@/pages/admin/AdminPage"));
const ProfilePage = lazy(() => import("@/pages/account/ProfilePage"));
const PinSetupPage = lazy(() => import("@/pages/onboarding/PinSetupPage"));
const LocationSetupPage = lazy(() => import("@/pages/onboarding/LocationSetupPage"));
const FaceEnrollmentPage = lazy(() => import("@/pages/onboarding/FaceEnrollmentPage"));
const QrPaymentPage = lazy(() => import("@/pages/finance/QrPaymentPage"));
const NotificationSettingsPage = lazy(() => import("@/pages/account/NotificationSettingsPage"));
const HelpPage = lazy(() => import("@/pages/support/HelpPage"));
const ServicesPage = lazy(() => import("@/pages/public/ServicesPage"));
const DownloadPage = lazy(() => import("@/pages/public/DownloadPage"));
const DemoPage = lazy(() => import("@/pages/public/DemoPage"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { token, fetchMe } = useAuthStore();

  useEffect(() => {
    if (token) {
      void fetchMe();
    }
  }, [fetchMe, token]);

  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? (
    <Navigate to="/dashboard" replace />
  ) : (
    <>{children}</>
  );
}

/** Start valid public QR links at / so static hosts never need a deep-link rewrite. */
function PaymentQrEntryRoute() {
  const location = useLocation();
  return parsePaymentQrSearch(location.search) ? (
    <Navigate to={{ pathname: "/transfer", search: location.search }} replace />
  ) : (
    <HomePage />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthInitializer>
          {/* PageTransition wrap toàn bộ Routes — logo reveal mỗi lần chuyển trang */}
          <PageTransition>
            <Suspense
              fallback={
                <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
                  {/* Fallback tối giản — overlay của PageTransition sẽ che phủ */}
                  <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-10 w-10 border-[3px] border-rose-200 border-t-rose-500" />
                    <p className="text-sm font-medium text-gray-400">
                      Đang tải...
                    </p>
                  </div>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<PaymentQrEntryRoute />} />
                <Route path="/terms" element={<LegalPage type="terms" />} />
                <Route path="/privacy" element={<LegalPage type="privacy" />} />
                <Route path="/mission" element={<MissionPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/download" element={<DownloadPage />} />
                <Route path="/demo" element={<DemoPage />} />
                <Route path="/cookies" element={<LegalPage type="cookies" />} />
                <Route
                  path="/login"
                  element={
                    <PublicOnlyRoute>
                      <LoginPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/register"
                  element={
                    <PublicOnlyRoute>
                      <RegisterPage />
                    </PublicOnlyRoute>
                  }
                />
                <Route
                  path="/forgot-password"
                  element={
                    <PublicOnlyRoute>
                      <ForgotPasswordPage />
                    </PublicOnlyRoute>
                  }
                />

                <Route
                  element={
                    <ProtectedRoute>
                      <LocationRequiredRoute>
                        <MainLayout />
                      </LocationRequiredRoute>
                    </ProtectedRoute>
                  }
                >
                  <Route path="/confirm-location" element={<LocationSetupPage />} />
                  <Route path="/setup-pin" element={<PinSetupPage />} />
                  <Route path="/setup-face" element={<FaceEnrollmentPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/transfer" element={<TransferPage />} />
                  <Route path="/history" element={<HistoryPage />} />
                  <Route path="/me" element={<ProfilePage />} />
                  <Route path="/notifications" element={<NotificationSettingsPage />} />
                  <Route path="/qr" element={<QrPaymentPage />} />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute requireAdmin>
                        <AdminPage />
                      </ProtectedRoute>
                    }
                  />
                </Route>

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </PageTransition>
        </AuthInitializer>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
