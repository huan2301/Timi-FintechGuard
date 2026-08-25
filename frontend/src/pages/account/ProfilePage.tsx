import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Shield,
  Lock,
  Bell,
  HelpCircle,
  ChevronRight,
  LogOut,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  Building2,
  X,
  Loader2,
  Mic,
  MicOff,
  Sparkles,
  ShieldCheck,
  CheckCheck,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/services/api/auth";
import { useScamGuardian } from "@/components/guardian/ScamGuardianProvider";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import axiosInstance from "@/services/api/axios";
import UserCardsSection from "@/components/profile/UserCardsSection";

type AppNotification = {
  id: string;
  title: string;
  body: string;
  kind: string;
  version?: string | null;
  is_read: boolean;
  created_at: string;
};

// Notification preferences are managed on the dedicated settings page.
// Keep the legacy panel disabled without using a constant expression in JSX.
const showLegacyNotificationPanel = false;

/** Chuông thông báo in-app (cập nhật hệ thống từ Admin). */
/** Chuông thông báo in-app (cập nhật hệ thống từ Admin). */
export function ProfileNotificationBell() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AppNotification | null>(null);
  const qc = useQueryClient();
  useBodyScrollLock(selected !== null, "notification-detail");

  const unreadQuery = useQuery({
    queryKey: ["notifications-unread"],
    queryFn: async () =>
      (await axiosInstance.get<{ count: number }>("/v1/notifications/unread-count"))
        .data,
    refetchInterval: 30_000,
    retry: false,
  });

  const listQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: async () =>
      (
        await axiosInstance.get<AppNotification[]>("/v1/notifications", {
          params: { limit: 30 },
        })
      ).data,
    enabled: open,
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) =>
      axiosInstance.post(`/v1/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const markAll = useMutation({
    mutationFn: async () => axiosInstance.post("/v1/notifications/read-all"),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      await qc.cancelQueries({ queryKey: ["notifications-unread"] });

      const previousItems = qc.getQueryData<AppNotification[]>(["notifications"]);
      const previousUnread = qc.getQueryData<{ count: number }>([
        "notifications-unread",
      ]);

      qc.setQueryData<AppNotification[]>(["notifications"], (current) =>
        current?.map((notification) => ({ ...notification, is_read: true })),
      );
      qc.setQueryData(["notifications-unread"], { count: 0 });

      return { previousItems, previousUnread };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;
      qc.setQueryData(["notifications"], context.previousItems);
      qc.setQueryData(["notifications-unread"], context.previousUnread);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: ["notifications-unread"] });
    },
  });

  const unread = unreadQuery.data?.count ?? 0;
  const items = listQuery.data ?? [];

  const kindMeta = (kind: string) => {
    switch (kind) {
      case "product_update":
        return {
          label: "Cập nhật",
          icon: Sparkles,
          badge: "bg-violet-100 text-violet-700",
          iconWrap: "bg-violet-100 text-violet-600",
        };
      case "security":
        return {
          label: "Bảo mật",
          icon: ShieldCheck,
          badge: "bg-amber-100 text-amber-800",
          iconWrap: "bg-amber-100 text-amber-600",
        };
      case "transaction":
        return {
          label: "Giao dịch",
          icon: CheckCircle2,
          badge: "bg-emerald-100 text-emerald-800",
          iconWrap: "bg-emerald-100 text-emerald-600",
        };
      default:
        return {
          label: "Hệ thống",
          icon: Bell,
          badge: "bg-slate-100 text-slate-700",
          iconWrap: "bg-slate-100 text-slate-600",
        };
    }
  };

  const formatRelativeTime = (iso?: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return "Vừa xong";
    if (diffMin < 60) return `${diffMin} phút trước`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} giờ trước`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD} ngày trước`;
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatFullTime = (iso?: string) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString("vi-VN", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const openDetail = (n: AppNotification) => {
    if (!n.is_read) markRead.mutate(n.id);
    setOpen(false);
    setSelected(n);
  };

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-violet-100 bg-white shadow-sm transition-colors hover:bg-violet-50"
        aria-label="Thông báo"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5 text-slate-600" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 px-1.5 text-[11px] font-bold text-white shadow-sm ring-2 ring-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => setOpen(false)}
          />

          <div
            className="
              fixed inset-x-3 top-[4.5rem] z-50 mx-auto max-h-[min(32rem,calc(100vh-6rem))]
              w-auto max-w-md overflow-hidden rounded-2xl border border-violet-100/80
              bg-white shadow-2xl shadow-violet-200/40
              sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[24rem]
            "
            role="dialog"
            aria-label="Danh sách thông báo"
          >
            {/* Header */}
            <div className="border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-4 py-3.5 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Thông báo
                    </h2>
                    {unread > 0 && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-bold text-white">
                        {unread} mới
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Cập nhật hệ thống và bảo mật từ Timi
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {unread > 0 && (
                    <button
                      type="button"
                      onClick={() => markAll.mutate()}
                      disabled={markAll.isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-60"
                      title="Đánh dấu tất cả đã đọc"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Đọc tất cả</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Đóng"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto overscroll-contain">
              {listQuery.isLoading && (
                <div className="divide-y divide-slate-50 p-2">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="flex animate-pulse gap-3 px-3 py-3.5"
                    >
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100" />
                      <div className="flex-1 space-y-2 py-0.5">
                        <div className="h-3.5 w-2/3 rounded bg-slate-100" />
                        <div className="h-3 w-full rounded bg-slate-50" />
                        <div className="h-3 w-1/3 rounded bg-slate-50" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {listQuery.isError && (
                <div className="m-4 rounded-xl border border-amber-100 bg-amber-50 px-4 py-5 text-center">
                  <Bell className="mx-auto h-8 w-8 text-amber-400" />
                  <p className="mt-2 text-sm font-semibold text-amber-800">
                    Không tải được thông báo
                  </p>
                  <p className="mt-1 text-xs text-amber-700/80">
                    Kiểm tra kết nối hoặc API /v1/notifications.
                  </p>
                  <button
                    type="button"
                    onClick={() => void listQuery.refetch()}
                    className="mt-3 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm ring-1 ring-amber-200 hover:bg-amber-50"
                  >
                    Thử lại
                  </button>
                </div>
              )}

              {!listQuery.isLoading &&
                !listQuery.isError &&
                items.length === 0 && (
                  <div className="flex flex-col items-center px-6 py-12 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-50 text-violet-400">
                      <Bell className="h-8 w-8" />
                    </div>
                    <p className="mt-4 text-sm font-semibold text-slate-700">
                      Chưa có thông báo
                    </p>
                    <p className="mt-1 max-w-[14rem] text-xs leading-relaxed text-slate-400">
                      Khi Admin công bố cập nhật hoặc có cảnh báo bảo mật, bạn
                      sẽ thấy tại đây.
                    </p>
                  </div>
                )}

              {items.map((n) => {
                const meta = kindMeta(n.kind);
                const Icon = meta.icon;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openDetail(n)}
                    className={`
                      group flex w-full gap-3 border-b border-slate-50 px-4 py-3.5 text-left
                      transition-colors last:border-b-0 hover:bg-violet-50/60
                      ${n.is_read ? "bg-white" : "bg-violet-50/40"}
                    `}
                  >
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.iconWrap}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm leading-snug text-slate-900 line-clamp-2 ${
                            n.is_read ? "font-medium" : "font-bold"
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.is_read && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-violet-500 ring-2 ring-violet-100" />
                        )}
                      </div>

                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-500 line-clamp-2">
                        {n.body}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}
                        >
                          {meta.label}
                          {n.version ? ` · v${n.version}` : ""}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {formatRelativeTime(n.created_at)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {items.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-2.5 text-center">
                <p className="text-[11px] text-slate-400">
                  Hiển thị {items.length} thông báo gần nhất · Bấm để xem đầy đủ
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* Modal chi tiết — giữa màn hình */}
      {selected && createPortal(
        <div
          className="fixed inset-0 z-[60] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain p-4 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notif-detail-title"
        >
          <div
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />

          <div className="relative z-10 my-4 w-full max-w-lg rounded-3xl border border-violet-100 bg-white shadow-2xl shadow-violet-300/30">
            <div className="shrink-0 border-b border-slate-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 px-5 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {(() => {
                    const meta = kindMeta(selected.kind);
                    return (
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}
                      >
                        {meta.label}
                        {selected.version ? ` · v${selected.version}` : ""}
                      </span>
                    );
                  })()}
                  <h2
                    id="notif-detail-title"
                    className="mt-2 text-lg font-bold leading-snug text-slate-900"
                  >
                    {selected.title}
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatFullTime(selected.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="shrink-0 rounded-full p-2 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
                  aria-label="Đóng"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-5 py-5 sm:px-6">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">
                {selected.body}
              </p>
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 sm:px-6">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 py-3 text-sm font-bold text-white shadow-md shadow-violet-200 transition hover:shadow-lg active:scale-[0.98]"
              >
                Đã hiểu
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, updateUser, fetchMe } = useAuthStore();
  // Treat older persisted sessions as Google-only until /me refreshes the
  // account identity. This prevents the password action from flashing back
  // into view for an existing Google session.
  const isGoogleAccount = user?.is_google_account !== false;
  const {
    voiceMonitoringEnabled,
    setVoiceMonitoringEnabled,
    status: guardianStatus,
    error: guardianError,
  } = useScamGuardian();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [notifications, setNotifications] = useState({
    transaction: true,
    security: true,
    promotion: false,
  });
  const [transactionPin, setTransactionPin] = useState("");
  const [currentTransactionPin, setCurrentTransactionPin] = useState("");
  const [confirmTransactionPin, setConfirmTransactionPin] = useState("");
  const [visibleTransactionPin, setVisibleTransactionPin] = useState<"current" | "new" | "confirm" | null>(null);
  const [profileNotice, setProfileNotice] = useState("");
  const [pinMessage, setPinMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isAvatarPreviewOpen, setIsAvatarPreviewOpen] = useState(false);
  const [isVoicePreferenceUpdating, setIsVoicePreferenceUpdating] =
    useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const pinRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useBodyScrollLock(
    showPasswordModal || showEmailModal || showPinModal || isAvatarPreviewOpen || Boolean(profileNotice),
    "profile-modal",
  );
  const overviewQuery = useQuery({
    queryKey: ["account-overview"],
    queryFn: authApi.overview,
    staleTime: 30_000,
  });
  const overview = overviewQuery.data;

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    const open = new URLSearchParams(location.search).get("open");
    if (open === "password" && !isGoogleAccount) setShowPasswordModal(true);
    if (open === "pin") setShowPinModal(true);
  }, [isGoogleAccount, location.search]);

  const handleAvatarChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const avatar = event.target.files?.[0];
    event.target.value = "";
    if (!avatar) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(avatar.type) ||
      avatar.size > 5 * 1024 * 1024
    ) {
      setAvatarError("Chọn ảnh JPG, PNG hoặc WebP có dung lượng tối đa 5 MB.");
      return;
    }
    setAvatarError("");
    setAvatarFailed(false);
    setIsUploadingAvatar(true);
    try {
      const updatedUser = await authApi.uploadAvatar(avatar);
      updateUser(updatedUser);
      setIsAvatarPreviewOpen(false);
    } catch {
      setAvatarError("Không thể tải ảnh lên. Vui lòng thử lại.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarDelete = async () => {
    if (!user?.avatar_url || isUploadingAvatar) return;
    if (!window.confirm("Bạn có chắc muốn xóa ảnh đại diện không?")) return;

    setAvatarError("");
    setIsUploadingAvatar(true);
    try {
      const updatedUser = await authApi.deleteAvatar();
      updateUser(updatedUser);
      setAvatarFailed(false);
      setIsAvatarPreviewOpen(false);
    } catch {
      setAvatarError("Không thể xóa ảnh đại diện. Vui lòng thử lại.");
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const menuItems = [
    {
      icon: Shield,
      isPasswordItem: true,
      label: "Bảo mật tài khoản",
      desc: "Đổi mật khẩu, xác thực 2 lớp",
      action: () => setShowPasswordModal(true),
      accent: "from-violet-500 to-purple-600",
      bg: "bg-violet-50",
      iconColor: "text-violet-600",
    },
    {
      icon: Bell,
      isPasswordItem: false,
      label: "Thông báo",
      desc: "Quản lý cài đặt thông báo",
      action: () => navigate("/notifications"),
      accent: "from-blue-500 to-indigo-600",
      bg: "bg-blue-50",
      iconColor: "text-blue-600",
    },
    {
      icon: Mail,
      isPasswordItem: false,
      label: "Đổi Gmail",
      desc: "Xác minh Gmail cũ và Gmail mới",
      action: () => setShowEmailModal(true),
      accent: "from-cyan-500 to-blue-600",
      bg: "bg-cyan-50",
      iconColor: "text-cyan-600",
    },
    {
      icon: Lock,
      isPasswordItem: false,
      label: "Thay đổi mã PIN",
      desc: "Cập nhật mã PIN giao dịch",
      action: () => setShowPinModal(true),
      accent: "from-fuchsia-500 to-pink-600",
      bg: "bg-fuchsia-50",
      iconColor: "text-fuchsia-600",
    },
    {
      icon: HelpCircle,
      isPasswordItem: false,
      label: "Trợ giúp",
      desc: "Câu hỏi thường gặp, liên hệ",
      action: () => navigate("/help"),
      accent: "from-slate-500 to-slate-700",
      bg: "bg-slate-100",
      iconColor: "text-slate-600",
    },
  ].filter((item) => !isGoogleAccount || !item.isPasswordItem);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  const handleVoiceMonitoringToggle = async () => {
    if (isVoicePreferenceUpdating) return;
    setIsVoicePreferenceUpdating(true);
    try {
      await setVoiceMonitoringEnabled(!voiceMonitoringEnabled);
    } finally {
      setIsVoicePreferenceUpdating(false);
    }
  };

  const revealTransactionPin = (field: "current" | "new" | "confirm") => {
    if (pinRevealTimer.current) clearTimeout(pinRevealTimer.current);
    setVisibleTransactionPin(field);
    pinRevealTimer.current = setTimeout(() => setVisibleTransactionPin(null), 200);
  };

  return (
    <div className="min-h-screen bg-[#f5f3ff] w-full relative overflow-x-hidden">
      {/* Soft background blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-violet-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] bg-fuchsia-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>
      <div className="relative z-10 max-w-[1100px] mx-auto">
        {/* ===== HEADER ===== */}
        <header className="px-4 sm:px-6 lg:px-8 pt-5 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2.5 hover:bg-white/70 rounded-full transition-colors"
              aria-label="Quay lại"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                Tài khoản
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Quản lý thông tin và bảo mật của bạn
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ProfileNotificationBell />
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-8 pb-10 space-y-6">
          {/* ===== HERO PROFILE CARD ===== */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 p-6 sm:p-8 text-white shadow-xl shadow-violet-200/50">
            <div className="absolute -top-16 -right-16 w-56 h-56 bg-white/10 rounded-full" />
            <div className="absolute -bottom-20 -left-10 w-48 h-48 bg-white/5 rounded-full" />
            <div className="absolute top-1/2 right-1/4 w-24 h-24 bg-white/5 rounded-full" />

            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div
                  role={user?.avatar_url && !avatarFailed ? "button" : undefined}
                  tabIndex={user?.avatar_url && !avatarFailed ? 0 : undefined}
                  onClick={() =>
                    user?.avatar_url &&
                    !avatarFailed &&
                    setIsAvatarPreviewOpen(true)
                  }
                  onKeyDown={(event) => {
                    if (
                      (event.key === "Enter" || event.key === " ") &&
                      user?.avatar_url &&
                      !avatarFailed
                    ) {
                      event.preventDefault();
                      setIsAvatarPreviewOpen(true);
                    }
                  }}
                  className={`w-24 h-24 sm:w-28 sm:h-28 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border-4 border-white/30 overflow-hidden shadow-lg ${
                    user?.avatar_url && !avatarFailed ? "cursor-pointer" : ""
                  }`}
                >
                  {user?.avatar_url && !avatarFailed ? (
                    <img
                      src={user.avatar_url}
                      onError={() => setAvatarFailed(true)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="w-12 h-12 sm:w-14 sm:h-14 text-white" />
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => void handleAvatarChange(event)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() =>
                    user?.avatar_url && !avatarFailed
                      ? setIsAvatarPreviewOpen(true)
                      : avatarInputRef.current?.click()
                  }
                  disabled={isUploadingAvatar}
                  aria-label="Đổi ảnh đại diện"
                  title="Đổi ảnh đại diện"
                  className="absolute bottom-0 right-0 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform disabled:opacity-60"
                >
                  {isUploadingAvatar ? (
                    <Loader2 className="w-4 h-4 text-violet-600 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 text-violet-600" />
                  )}
                </button>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl sm:text-3xl font-bold truncate">
                  {user?.full_name || "Người dùng"}
                </h2>
                <p className="text-violet-100 text-base mt-1 truncate">
                  {user?.email || "email@example.com"}
                </p>
                <div className="flex flex-wrap items-center gap-2.5 mt-3">
                  <span className="px-3.5 py-1.5 bg-white/20 backdrop-blur rounded-full text-sm font-semibold">
                    {user?.role === "admin" ? "Admin" : "Thành viên"}
                  </span>
                  {user?.is_active && (
                    <span className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/30 backdrop-blur rounded-full text-sm font-semibold text-emerald-100">
                      <CheckCircle2 className="w-4 h-4" />
                      Đã xác minh
                    </span>
                  )}
                </div>
              </div>
            </div>

            {avatarError && (
              <p className="relative z-10 mt-4 text-sm text-violet-100 bg-white/10 rounded-xl px-4 py-2">
                {avatarError}
              </p>
            )}

            {/* Stats */}
            <div className="relative z-10 mt-7 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              {[
                {
                  value: new Intl.NumberFormat("vi-VN").format(
                    overview?.balance ?? user?.balance ?? 0,
                  ),
                  label: "Số dư (VND)",
                },
                {
                  value: overview?.transactions_today ?? "—",
                  label: "Giao dịch hôm nay",
                },
                {
                  value: overview?.transactions_this_month ?? "—",
                  label: "Giao dịch tháng",
                },
                {
                  value: overview?.security_grade ?? "—",
                  label: overview
                    ? `Điểm bảo mật ${overview.security_score}/100`
                    : "Điểm bảo mật",
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white/15 backdrop-blur-md rounded-2xl p-4 text-center border border-white/10"
                >
                  <p className="text-xl sm:text-2xl font-bold tabular-nums">
                    {stat.value}
                  </p>
                  <p className="text-xs sm:text-sm text-violet-100 mt-1.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ===== SECURITY SCORE ===== */}
          <section className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-violet-50 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-6 py-5">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-200">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Điểm bảo mật
                  </h3>
                  <p className="text-sm text-slate-500">
                    Các lớp bảo vệ đã có và còn thiếu
                  </p>
                </div>
              </div>
              <p className="text-right text-2xl sm:text-3xl font-black text-violet-600">
                {overview
                  ? `${overview.security_grade} · ${overview.security_score}/100`
                  : "Đang tải"}
              </p>
            </div>

            <div className="p-6">
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                  style={{ width: `${overview?.security_score ?? 0}%` }}
                />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overview?.security_checks.map((check) => (
                  <div
                    key={check.label}
                    className={`rounded-xl border p-4 transition-colors ${
                      check.completed
                        ? "border-emerald-100 bg-emerald-50/60"
                        : "border-amber-100 bg-amber-50/60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-800">
                        {check.label}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold shrink-0 ${
                          check.completed
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {check.completed
                          ? `+${check.score}`
                          : `Còn +${check.score}`}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-500">
                      {check.completed ? "Đã kích hoạt" : check.detail}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {overview && !overview.transaction_pin_configured && (
                  <button
                    onClick={() => navigate("/setup-pin")}
                    className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 transition-colors"
                  >
                    Tạo PIN giao dịch (+30 điểm)
                  </button>
                )}
                {overview &&
                  overview.transaction_pin_configured &&
                  overview.security_checks.some(
                    (check) =>
                      check.label === "Khuôn mặt" && !check.completed,
                  ) && (
                    <button
                      onClick={() => navigate("/setup-face")}
                      className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-5 py-3 text-sm font-bold text-white hover:shadow-lg shadow-violet-200 transition-all"
                    >
                      Cài đặt khuôn mặt (+30 điểm)
                    </button>
                  )}
              </div>
            </div>
          </section>

          {/* ===== TWO COLUMN: Personal + Settings ===== */}
          <div className="grid grid-cols-1 items-start lg:grid-cols-2 gap-6">
            {/* Personal Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Thông tin cá nhân
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {[
                  {
                    icon: User,
                    label: "Họ và tên",
                    value: user?.full_name || "Chưa cập nhật",
                    bg: "bg-violet-50",
                    color: "text-violet-600",
                  },
                  {
                    icon: Mail,
                    label: "Email",
                    value: user?.email || "Chưa cập nhật",
                    bg: "bg-blue-50",
                    color: "text-blue-600",
                  },
                  {
                    icon: Phone,
                    label: "Số điện thoại",
                    value: user?.phone || "Chưa cập nhật",
                    bg: "bg-emerald-50",
                    color: "text-emerald-600",
                  },
                  {
                    icon: Building2,
                    label: "Tài khoản Timi Bank",
                    value:
                      user?.timi_bank_enabled && user.phone
                        ? user.phone
                        : "Chưa đủ điều kiện dùng Timi Bank",
                    bg: "bg-fuchsia-50",
                    color: "text-fuchsia-600",
                    mono: true,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-violet-50/40 transition-colors"
                  >
                    <div
                      className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center shrink-0`}
                    >
                      <item.icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-500">{item.label}</p>
                      <p
                        className={`font-semibold text-slate-900 truncate text-base ${
                          item.mono ? "font-mono" : ""
                        }`}
                      >
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <UserCardsSection embedded />
            </div>

            {/* Settings Menu */}
            <div className="self-start bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-50">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Cài đặt
                </h3>
              </div>
              <div className="divide-y divide-slate-50">
                {/* Voice monitoring */}
                <div className="flex items-center gap-4 px-6 py-4 hover:bg-violet-50/40 transition-colors">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                      voiceMonitoringEnabled ? "bg-emerald-50" : "bg-slate-100"
                    }`}
                  >
                    {voiceMonitoringEnabled ? (
                      <Mic className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <MicOff className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold text-slate-900 text-base">
                      Tự động nghe và bảo vệ cuộc gọi
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">
                      {voiceMonitoringEnabled
                        ? guardianStatus === "active"
                          ? "Đang hoạt động ngầm khi bạn sử dụng ứng dụng"
                          : "Đang bật, sẽ tự khởi động lại khi cần"
                        : guardianError.includes("Đã tự động tắt nghe và bảo vệ cuộc gọi")
                          ? "Đã tự động tắt vì Guardian Risk Agent không phản hồi"
                          : "Đã tắt, Timi sẽ không truy cập microphone"}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={voiceMonitoringEnabled}
                    aria-label="Bật hoặc tắt tự động nghe và bảo vệ cuộc gọi"
                    aria-busy={isVoicePreferenceUpdating}
                    onClick={() => void handleVoiceMonitoringToggle()}
                    disabled={isVoicePreferenceUpdating}
                    className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-4 focus:ring-emerald-500/20 disabled:cursor-wait disabled:opacity-60 ${
                      voiceMonitoringEnabled
                        ? "border-emerald-600 bg-emerald-500"
                        : "border-slate-300 bg-slate-200"
                    }`}
                  >
                    <span
                      className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${
                        voiceMonitoringEnabled
                          ? "translate-x-6"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {menuItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="flex items-center gap-4 px-6 py-4 w-full hover:bg-violet-50/40 transition-colors group"
                  >
                    <div
                      className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}
                    >
                      <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="font-semibold text-slate-900 text-base">
                        {item.label}
                      </p>
                      <p className="text-sm text-slate-400 mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {showLegacyNotificationPanel && (
          <div className="bg-white rounded-2xl shadow-sm border border-violet-100/80 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-50 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Thông báo
              </h3>
            </div>
            <div className="divide-y divide-slate-50">
              {[
                {
                  key: "transaction" as const,
                  label: "Giao dịch",
                  desc: "Nhận thông báo khi có giao dịch mới",
                },
                {
                  key: "security" as const,
                  label: "Bảo mật",
                  desc: "Cảnh báo khi phát hiện đăng nhập lạ",
                },
                {
                  key: "promotion" as const,
                  label: "Khuyến mãi",
                  desc: "Thông báo ưu đãi và khuyến mãi",
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between px-6 py-4 hover:bg-violet-50/40 transition-colors"
                >
                  <div className="min-w-0 pr-4">
                    <p className="font-semibold text-slate-900 text-base">
                      {item.label}
                    </p>
                    <p className="text-sm text-slate-400 mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    onClick={() =>
                      setNotifications({
                        ...notifications,
                        [item.key]: !notifications[item.key],
                      })
                    }
                    type="button"
                    role="switch"
                    aria-checked={notifications[item.key]}
                    aria-label={`Bật hoặc tắt thông báo ${item.label}`}
                    className={`relative flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors focus:outline-none focus:ring-4 focus:ring-violet-500/20 ${
                      notifications[item.key]
                        ? "border-violet-700 bg-violet-600"
                        : "border-slate-300 bg-slate-200"
                    }`}
                  >
                    <div
                      className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform ${
                        notifications[item.key]
                          ? "translate-x-6"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          )}

          {/* ===== LOGOUT ===== */}
          <button
            onClick={() => void handleLogout()}
            className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl hover:bg-red-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 text-base border border-red-100"
          >
            <LogOut className="w-5 h-5" />
            Đăng xuất
          </button>
        </div>

        {/* Footer */}
        <footer className="relative z-10 px-4 sm:px-6 lg:px-8 pb-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <p>© 2024 Timi. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate("/privacy")} className="hover:text-slate-600 transition-colors">
              Privacy Policy
            </button>
            <button onClick={() => navigate("/terms")} className="hover:text-slate-600 transition-colors">
              Terms of Service
            </button>
            <button onClick={() => navigate("/help")} className="hover:text-slate-600 transition-colors">
              Help Center
            </button>
          </div>
        </footer>
      </div>

      {/* Decorative wave */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-48 sm:h-56 md:h-72 overflow-hidden opacity-30 select-none"
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

      {showPasswordModal && !isGoogleAccount && (
        <PasswordChangeModal onClose={() => setShowPasswordModal(false)} />
      )}

      {showEmailModal && user?.email && (
        <EmailChangeModal
          currentEmail={user.email}
          onClose={() => setShowEmailModal(false)}
          onSuccess={(updatedUser) => {
            updateUser(updatedUser);
            setShowEmailModal(false);
            setProfileNotice("Đổi Gmail thành công");
            setTimeout(() => setProfileNotice(""), 3500);
          }}
        />
      )}

      {showPinModal && createPortal(
        <div className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center">
          <div className="relative my-4 w-full max-w-md rounded-3xl bg-white p-7 shadow-2xl border border-violet-100">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Thay đổi mã PIN
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Nhập PIN hiện tại và PIN mới 4–6 chữ số.
                </p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-violet-100 flex items-center justify-center">
                <Lock className="h-6 w-6 text-violet-600" />
              </div>
            </div>
            <div className="relative mb-3">
              <input
                value={currentTransactionPin}
                onChange={(event) => setCurrentTransactionPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                type={visibleTransactionPin === "current" ? "text" : "password"}
                autoComplete="current-password"
                placeholder="PIN hiện tại"
                className="w-full rounded-xl border border-violet-200 bg-slate-50 p-4 pr-12 text-center text-lg tracking-[0.4em] outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-400"
              />
              <button type="button" tabIndex={-1} onClick={() => revealTransactionPin("current")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-violet-500 hover:bg-violet-100" aria-label="Xem PIN hiện tại trong 0,2 giây">
                {visibleTransactionPin === "current" ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div className="relative">
              <input
                value={transactionPin}
                onChange={(event) =>
                  setTransactionPin(
                    event.target.value.replace(/\D/g, "").slice(0, 6),
                  )
                }
                inputMode="numeric"
                type={visibleTransactionPin === "new" ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Nhập mã PIN mới"
                className="w-full rounded-xl border border-violet-200 bg-slate-50 p-4 pr-12 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-300 transition-all"
              />
              <button type="button" tabIndex={-1} onClick={() => revealTransactionPin("new")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-violet-500 hover:bg-violet-100" aria-label="Xem PIN mới trong 0,2 giây">
                {visibleTransactionPin === "new" ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <div className="relative mt-3">
              <input
                value={confirmTransactionPin}
                onChange={(event) => setConfirmTransactionPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                type={visibleTransactionPin === "confirm" ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Nhập lại PIN mới"
                className="w-full rounded-xl border border-violet-200 bg-slate-50 p-4 pr-12 text-center text-lg tracking-[0.4em] outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-400"
              />
              <button type="button" tabIndex={-1} onClick={() => revealTransactionPin("confirm")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-violet-500 hover:bg-violet-100" aria-label="Xem PIN xác nhận trong 0,2 giây">
                {visibleTransactionPin === "confirm" ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {pinMessage && (
              <p className="mt-3 text-sm text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
                {pinMessage}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowPinModal(false);
                  setVisibleTransactionPin(null);
                  setCurrentTransactionPin("");
                  setTransactionPin("");
                  setConfirmTransactionPin("");
                  setPinMessage("");
                }}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3.5 font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Quay lại
              </button>
              <button
                onClick={() => {
                  if (transactionPin === currentTransactionPin) {
                    setPinMessage("Mã PIN mới phải khác mã PIN cũ");
                    return;
                  }
                  void authApi
                    .setTransactionPin(transactionPin, currentTransactionPin)
                    .then(() => {
                      setPinMessage("Đã cập nhật PIN");
                      setCurrentTransactionPin("");
                      setTransactionPin("");
                      setConfirmTransactionPin("");
                      void overviewQuery.refetch();
                      setTimeout(() => {
                        setShowPinModal(false);
                        setPinMessage("");
                        setProfileNotice("Đổi mã PIN thành công");
                        setTimeout(() => setProfileNotice(""), 3500);
                      }, 700);
                    })
                    .catch((error: any) => setPinMessage(error?.response?.data?.detail || "Không thể thay đổi mã PIN"))
                }}
                disabled={!/^\d{4,6}$/.test(currentTransactionPin) || !/^\d{4,6}$/.test(transactionPin) || transactionPin !== confirmTransactionPin}
                className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white disabled:opacity-50 hover:shadow-lg shadow-violet-200 transition-all"
              >
                Xác nhận đổi PIN
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {isAvatarPreviewOpen && user?.avatar_url && !avatarFailed && createPortal(
        <div
          className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/75 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setIsAvatarPreviewOpen(false)}
        >
          <div
            className="my-4 w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-violet-100"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Ảnh đại diện</h2>
              <button
                type="button"
                onClick={() => setIsAvatarPreviewOpen(false)}
                aria-label="Đóng ảnh đại diện"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={user.avatar_url}
              alt="Ảnh đại diện phóng to"
              className="mx-auto max-h-[65vh] w-full rounded-2xl object-contain"
            />
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white disabled:opacity-60 hover:shadow-lg transition-all"
              >
                {isUploadingAvatar && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {isUploadingAvatar ? "Đang thay ảnh..." : "Thay ảnh"}
              </button>
              <button
                type="button"
                onClick={() => void handleAvatarDelete()}
                disabled={isUploadingAvatar}
                className="flex-1 rounded-xl bg-red-50 px-4 py-3.5 font-semibold text-red-600 disabled:opacity-60 hover:bg-red-100 transition-colors"
              >
                Xóa ảnh
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {profileNotice && createPortal(
        <div className="fixed inset-0 z-[100] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/45 p-4 backdrop-blur-sm sm:items-center" role="alertdialog" aria-modal="true">
          <div className="my-4 w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-7 text-center shadow-2xl shadow-emerald-950/15">
            <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
            <p className="mt-4 text-lg font-bold text-slate-900">{profileNotice}</p>
            <button type="button" onClick={() => setProfileNotice("")} className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-700" aria-label="Đóng thông báo">Đã hiểu</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function EmailChangeModal({
  currentEmail,
  onClose,
  onSuccess,
}: {
  currentEmail: string;
  onClose: () => void;
  onSuccess: (user: import("@/services/api/auth").User) => void;
}) {
  const [newEmail, setNewEmail] = useState("");
  const [oldOtp, setOldOtp] = useState("");
  const [newOtp, setNewOtp] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requestCodes = async () => {
    const normalized = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Vui lòng nhập Gmail mới hợp lệ");
      return;
    }
    if (normalized === currentEmail.toLowerCase()) {
      setError("Gmail mới phải khác Gmail hiện tại");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await authApi.requestEmailChange(normalized);
      setSent(true);
      setMessage(result.message);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || "Không thể gửi mã xác minh");
    } finally {
      setBusy(false);
    }
  };

  const verifyCodes = async () => {
    if (!/^\d{6}$/.test(oldOtp) || !/^\d{6}$/.test(newOtp)) {
      setError("Vui lòng nhập đủ mã 6 chữ số của cả hai Gmail");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const updatedUser = await authApi.verifyEmailChange(oldOtp, newOtp);
      onSuccess(updatedUser);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.detail || "Mã xác minh không đúng");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="my-4 w-full max-w-md rounded-3xl border border-violet-100 bg-white p-7 shadow-2xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div><h2 className="text-xl font-bold text-slate-900">Đổi Gmail</h2><p className="mt-1 text-sm text-slate-500">Cần xác minh cả Gmail cũ và Gmail mới.</p></div>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-cyan-50"><Mail className="h-6 w-6 text-cyan-600" /></div>
        </div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-600">Gmail hiện tại</label>
        <input value={currentEmail} readOnly className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-100 p-4 text-slate-500" />
        <label className="mb-1.5 block text-sm font-semibold text-slate-600">Gmail mới</label>
        <input value={newEmail} onChange={(event) => setNewEmail(event.target.value)} type="email" autoComplete="email" disabled={sent} placeholder="tenban@gmail.com" className="w-full rounded-xl border border-violet-200 bg-slate-50 p-4 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-400/20 disabled:opacity-60" />
        {sent && <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="mb-1.5 block text-xs font-semibold text-slate-500">Mã gửi Gmail cũ</label><input value={oldOtp} onChange={(event) => setOldOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" className="w-full rounded-xl border border-violet-200 bg-slate-50 p-3 text-center tracking-[0.3em] outline-none focus:ring-2 focus:ring-violet-400/20" /></div><div><label className="mb-1.5 block text-xs font-semibold text-slate-500">Mã gửi Gmail mới</label><input value={newOtp} onChange={(event) => setNewOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" maxLength={6} placeholder="000000" className="w-full rounded-xl border border-violet-200 bg-slate-50 p-3 text-center tracking-[0.3em] outline-none focus:ring-2 focus:ring-violet-400/20" /></div></div>}
        {message && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex gap-3"><button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl bg-slate-100 px-4 py-3.5 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-60">Quay lại</button><button type="button" onClick={() => void (sent ? verifyCodes() : requestCodes())} disabled={busy} className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-blue-100 hover:shadow-xl disabled:opacity-60">{busy ? "Đang xử lý..." : sent ? "Xác nhận đổi Gmail" : "Gửi mã xác minh"}</button></div>
      </div>
    </div>,
    document.body,
  );
}

function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ current: "", new: "", confirm: "" });
  const [showPass, setShowPass] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.new !== form.confirm) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setLoading(false);
    setSuccess(true);
    setTimeout(onClose, 1500);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-4 animate-in fade-in backdrop-blur-sm sm:items-center">
      <div className="my-4 bg-white rounded-t-3xl sm:rounded-3xl p-7 w-full max-w-md animate-in slide-in-from-bottom-10 border border-violet-100 shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900">Đổi mật khẩu</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="text-lg font-bold text-slate-800">
              Đổi mật khẩu thành công!
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {(
              [
                { key: "current" as const, label: "Mật khẩu hiện tại" },
                { key: "new" as const, label: "Mật khẩu mới" },
                { key: "confirm" as const, label: "Xác nhận mật khẩu mới" },
              ] as const
            ).map((field) => (
              <div key={field.key}>
                <label className="text-sm text-slate-600 mb-1.5 block font-medium">
                  {field.label}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
                  <input
                    type={showPass[field.key] ? "text" : "password"}
                    className="w-full pl-11 pr-11 py-3 bg-slate-50 rounded-xl border border-transparent focus:ring-2 focus:ring-violet-400 focus:border-violet-300 outline-none text-slate-800 transition-all"
                    value={form[field.key]}
                    onChange={(e) =>
                      setForm({ ...form, [field.key]: e.target.value })
                    }
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() =>
                      setShowPass({
                        ...showPass,
                        [field.key]: !showPass[field.key],
                      })
                    }
                    className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPass[field.key] ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            ))}

            {form.confirm && form.new !== form.confirm && (
              <p className="text-sm text-red-500">Mật khẩu không khớp</p>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                !form.current ||
                !form.new ||
                form.new !== form.confirm
              }
              className="w-full py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-xl shadow-lg shadow-violet-200 hover:shadow-xl active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? "Đang xử lý..." : "Xác nhận đổi mật khẩu"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
