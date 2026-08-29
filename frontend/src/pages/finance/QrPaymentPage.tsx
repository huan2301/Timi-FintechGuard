import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImageUp,
  Link2,
  Loader2,
  QrCode,
  ScanLine,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  X,
  Share2,
  Shield,
  Info,
  ChevronRight,
} from "lucide-react";

import {
  createPaymentQrLink,
  parseQrContent,
  paymentBanks,
  type DecodedQrContent,
  type PaymentQrData,
} from "@/utils/paymentQr";
import { urlSafetyApi } from "@/services/api/urlSafety";
import { useAuthStore } from "@/stores/authStore";
import { ProfileNotificationBell } from "@/pages/account/ProfilePage";
import UserAvatar from "@/components/profile/UserAvatar";
import { getPublicWebOrigin } from "@/utils/publicWebUrl";

const CAMERA_READER_ID = "timi-qr-camera";

type Mode = "scan" | "create";
type ScannerState = "idle" | "starting" | "scanning";
type UrlSafetyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "clear"; hostname: string | null }
  | { status: "blocked"; hostname: string | null; reason: string }
  | { status: "unavailable" };

const formatMoney = (amount?: number) =>
  amount ? `${new Intl.NumberFormat("vi-VN").format(amount)} đ` : "Không cố định";

function cameraErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null) {
    const candidate = error as { name?: unknown; message?: unknown };
    const name = typeof candidate.name === "string" ? candidate.name : "";
    const message = typeof candidate.message === "string" ? candidate.message : "";
    if (name || message) return [name, message].filter(Boolean).join(": ");
  }
  return "Không rõ nguyên nhân";
}

function getInitialMode(search: string): Mode {
  return new URLSearchParams(search).get("mode") === "scan" ? "scan" : "create";
}

export default function QrPaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const urlSafetyRequestRef = useRef(0);
  const [mode, setMode] = useState<Mode>(() => getInitialMode(location.search));
  const [scannerState, setScannerState] = useState<ScannerState>("idle");
  const [scanError, setScanError] = useState("");
  const [decodedContent, setDecodedContent] = useState<DecodedQrContent | null>(null);
  const [urlSafetyState, setUrlSafetyState] = useState<UrlSafetyState>({ status: "idle" });
  const [form, setForm] = useState({
    amount: "",
    note: "",
  });
  const [generatedQr, setGeneratedQr] = useState<{
    image: string;
    paymentLink: string;
    payment: PaymentQrData;
  } | null>(null);
  const [createError, setCreateError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const ownAccountNumber = user?.phone?.trim() ?? "";
  const ownAccountName = user?.full_name.trim() ?? "";
  const canCreateOwnQr = Boolean(
    user?.timi_bank_enabled && /^\d{10}$/.test(ownAccountNumber) && ownAccountName,
  );

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;

    try {
      await scanner.stop();
    } catch {
      // stop() rejects when the camera has not started yet; clear still removes its DOM nodes.
    }
    try {
      await scanner.clear();
    } catch {
      // The reader may already have been removed while navigating away.
    }
  }, []);

  useEffect(() => () => {
    void stopScanner();
  }, [stopScanner]);

  const resetUrlSafety = useCallback(() => {
    urlSafetyRequestRef.current += 1;
    setUrlSafetyState({ status: "idle" });
  }, []);

  const checkUrlSafety = useCallback(async (url: string) => {
    const requestId = urlSafetyRequestRef.current + 1;
    urlSafetyRequestRef.current = requestId;
    setUrlSafetyState({ status: "checking" });

    try {
      const result = await urlSafetyApi.check(url);
      if (requestId !== urlSafetyRequestRef.current) return;
      setUrlSafetyState(
        result.blocked
          ? {
              status: "blocked",
              hostname: result.hostname,
              reason: result.reason ?? "Tên miền này nằm trong blacklist URL lừa đảo.",
            }
          : { status: "clear", hostname: result.hostname },
      );
    } catch {
      if (requestId === urlSafetyRequestRef.current) {
        // A link must not become openable merely because the safety service is
        // unavailable or the user's session has expired.
        setUrlSafetyState({ status: "unavailable" });
      }
    }
  }, []);

  const switchMode = async (nextMode: Mode) => {
    await stopScanner();
    setScannerState("idle");
    setScanError("");
    setDecodedContent(null);
    resetUrlSafety();
    setMode(nextMode);
  };

  const handleDecodedText = useCallback(
    (decodedText: string) => {
      const content = parseQrContent(decodedText);
      setScanError("");
      setScannerState("idle");
      void stopScanner();

      if (content.kind === "payment") {
        resetUrlSafety();
        // A successful payment QR goes straight to the transfer form. The
        // transfer page deliberately performs a fresh recipient lookup first.
        navigate("/transfer", { state: { QrPayment: content.payment } });
        return true;
      }

      // Never open URLs, call phone numbers, or join Wi-Fi automatically. The
      // result panel makes the scanned content and link risk signals explicit.
      setDecodedContent(content);
      if (content.kind === "url" && content.normalizedUrl) {
        void checkUrlSafety(content.normalizedUrl);
      } else {
        resetUrlSafety();
      }
      return true;
    },
    [checkUrlSafety, navigate, resetUrlSafety, stopScanner],
  );

  const startScanner = async () => {
    if (scannerRef.current) return;
    setScanError("");
    setDecodedContent(null);
    resetUrlSafety();
    setScannerState("starting");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Trình duyệt hoặc địa chỉ hiện tại không hỗ trợ truy cập camera.");
      }
      let scanner = new Html5Qrcode(CAMERA_READER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      const scanConfig = { fps: 10, qrbox: { width: 240, height: 240 } };
      try {
        // On mobile this normally selects the rear camera without requiring a
        // device-specific id.
        await scanner.start(
          { facingMode: { ideal: "environment" } },
          scanConfig,
          handleDecodedText,
          () => undefined,
        );
      } catch (preferredCameraError) {
        // Some desktop browsers reject facingMode constraints even though a
        // permitted camera exists. Do not reuse the failed scanner here: its
        // internal state may still be transitioning after start() rejects.
        scannerRef.current = null;
        try {
          scanner.clear();
        } catch {
          // The failed scanner may not have rendered a reader yet.
        }
        const cameras = await Html5Qrcode.getCameras();
        const preferredCamera =
          cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ?? cameras[0];
        if (!preferredCamera) throw preferredCameraError;
        scanner = new Html5Qrcode(CAMERA_READER_ID, {
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          verbose: false,
        });
        scannerRef.current = scanner;
        await scanner.start(preferredCamera.id, scanConfig, handleDecodedText, () => undefined);
      }
      setScannerState("scanning");
    } catch (error) {
      const failedScanner = scannerRef.current;
      scannerRef.current = null;
      try {
        failedScanner?.clear();
      } catch {
        // The reader may not have rendered yet.
      }
      setScannerState("idle");
      const message = cameraErrorMessage(error);
      const secureContextHint = window.isSecureContext
        ? "Hãy cấp quyền camera cho trình duyệt rồi thử lại."
        : "Camera chỉ hoạt động trên HTTPS hoặc localhost. Khi mở bằng IP mạng nội bộ, hãy dùng HTTPS hoặc tải ảnh QR bên dưới.";
      setScanError(`Không thể mở camera. ${secureContextHint} (${message})`);
    }
  };

  const scanImageFile = async (file: File) => {
    await stopScanner();
    setScanError("");
    setDecodedContent(null);
    resetUrlSafety();
    setScannerState("starting");
    try {
      const scanner = new Html5Qrcode(CAMERA_READER_ID, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      });
      scannerRef.current = scanner;
      const decodedText = await scanner.scanFile(file, true);
      handleDecodedText(decodedText);
    } catch {
      setScanError(
        "Không thể đọc QR từ ảnh này. Hãy dùng ảnh rõ nét, không bị cắt mất viền QR.",
      );
    } finally {
      setScannerState("idle");
      await stopScanner();
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError("");
    if (!canCreateOwnQr) {
      setCreateError(
        "Tài khoản Timi Bank chưa sẵn sàng. Hãy cập nhật số điện thoại gồm đúng 10 chữ số trong hồ sơ.",
      );
      return;
    }
    const amount = form.amount.trim() ? Number(form.amount) : undefined;
    const payment: PaymentQrData = {
      accountNumber: ownAccountNumber,
      bankCode: "TIMI",
      ...(amount ? { amount } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      accountName: ownAccountName,
    };
    const publicWebOrigin = getPublicWebOrigin(window.location.origin);
    if (!publicWebOrigin) {
      setCreateError(
        "VITE_PUBLIC_WEB_URL không hợp lệ. Hãy đặt URL HTTPS của web đã deploy rồi build lại.",
      );
      return;
    }

    const paymentLink = createPaymentQrLink(payment, publicWebOrigin);
    if (!paymentLink) {
      setCreateError(
        "Kiểm tra lại ngân hàng, số tài khoản (6–19 chữ số), số tiền và nội dung.",
      );
      return;
    }

    setIsCreating(true);
    try {
      const image = await QRCode.toDataURL(paymentLink, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 440,
        color: { dark: "#171717", light: "#FFFFFF" },
      });
      setGeneratedQr({ image, paymentLink, payment });
    } catch {
      setCreateError("Không thể tạo hình QR. Vui lòng thử lại.");
    } finally {
      setIsCreating(false);
    }
  };

  const downloadQr = () => {
    if (!generatedQr) return;
    const link = document.createElement("a");
    link.href = generatedQr.image;
    link.download = "timi-qr-thanh-toan.png";
    link.click();
  };

  const shareQr = async () => {
    if (!generatedQr) return;
    try {
      if (navigator.share) {
        // Convert data URL to blob for native share
        const res = await fetch(generatedQr.image);
        const blob = await res.blob();
        const file = new File([blob], "timi-qr.png", { type: "image/png" });
        await navigator.share({
          title: "Mã QR nhận tiền Timi",
          text: "Quét mã này để chuyển tiền cho tôi qua Timi",
          url: generatedQr.paymentLink,
          files: [file],
        });
      } else {
        await navigator.clipboard.writeText(generatedQr.paymentLink);
        alert("Đã sao chép liên kết thanh toán vào clipboard.");
      }
    } catch {
      // User cancelled or share failed – ignore
    }
  };

  return (
    <div className="min-h-screen w-full relative overflow-x-clip bg-[#f5f3ff]">
      {/* Soft background blobs */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] bg-violet-200/40 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-24 w-[420px] h-[420px] bg-fuchsia-200/30 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-1/3 w-[380px] h-[380px] bg-indigo-200/25 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto">
        {/* ===== TOP HEADER ===== */}
        <header style={{ marginLeft: "calc((100% - 100vw) / 2)" }} className="sticky top-16 z-40 flex w-screen max-w-none flex-col gap-2 border-b border-violet-100/60 bg-[#f5f3ff]/75 px-4 py-2 shadow-sm shadow-violet-100/20 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 hover:bg-white/70 rounded-full transition-colors"
              aria-label="Quay lại"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {mode === "scan" ? "Quét Mã QR" : "Nhận tiền"}
              </h1>
              <p className="sr-only">
                {mode === "scan"
                  ? "Quét mã QR để kiểm tra đường dẫn hoặc thực hiện thanh toán an toàn"
                  : "Chia sẻ mã QR hoặc thông tin thanh toán để nhận tiền"}
              </p>
            </div>
          </div>

          <div className="flex self-end items-center gap-3 sm:self-auto">
            <ProfileNotificationBell />
            <UserAvatar
              avatarUrl={user?.avatar_url}
              name={user?.full_name}
              className="h-10 w-10 border border-white shadow-md"
            />
          </div>
        </header>

        {/* ===== MAIN CONTENT ===== */}
        <div className="px-4 sm:px-6 lg:px-8 pb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
            {/* ---------- LEFT COLUMN ---------- */}
            <div className="lg:col-span-7 space-y-5">
              {/* Mode tabs */}
              <div className="bg-white rounded-2xl p-1.5 shadow-sm border border-violet-100/80 flex">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "scan"}
                  onClick={() => void switchMode("scan")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                    mode === "scan"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                      : "text-slate-500 hover:text-violet-600 hover:bg-violet-50"
                  }`}
                >
                  <ScanLine className="w-4 h-4" />
                  Quét QR
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === "create"}
                  onClick={() => void switchMode("create")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${
                    mode === "create"
                      ? "bg-violet-600 text-white shadow-md shadow-violet-200"
                      : "text-slate-500 hover:text-violet-600 hover:bg-violet-50"
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  Mã QR của tôi
                </button>
              </div>

              {/* ===== SCAN MODE ===== */}
              {mode === "scan" && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-violet-100/80">
                  {/* Camera viewfinder */}
                  <div className="relative overflow-hidden rounded-2xl bg-slate-950 aspect-square max-h-[420px] mx-auto grid place-items-center">
                    <div
                      id={CAMERA_READER_ID}
                      className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
                    />

                    {/* Corner brackets overlay (when not scanning) */}
                    {scannerState !== "scanning" && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Top-left */}
                        <div className="absolute top-6 left-6 w-10 h-10 border-t-4 border-l-4 border-violet-400 rounded-tl-lg" />
                        {/* Top-right */}
                        <div className="absolute top-6 right-6 w-10 h-10 border-t-4 border-r-4 border-violet-400 rounded-tr-lg" />
                        {/* Bottom-left */}
                        <div className="absolute bottom-6 left-6 w-10 h-10 border-b-4 border-l-4 border-violet-400 rounded-bl-lg" />
                        {/* Bottom-right */}
                        <div className="absolute bottom-6 right-6 w-10 h-10 border-b-4 border-r-4 border-violet-400 rounded-br-lg" />
                      </div>
                    )}

                    {scannerState !== "scanning" && (
                      <div className="absolute text-center text-white px-6 z-10">
                        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center">
                          <Camera className="w-8 h-8 text-violet-300" />
                        </div>
                        <p className="text-sm font-medium text-white/90">
                          Hướng camera vào mã QR
                        </p>
                        <p className="text-xs text-white/60 mt-1">
                          Đặt mã QR trong khung hình để quét thanh toán
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {scannerState === "scanning" ? (
                      <button
                        type="button"
                        onClick={() => {
                          void stopScanner();
                          setScannerState("idle");
                        }}
                        className="py-3 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 flex items-center justify-center gap-2 transition-colors"
                      >
                        <X className="w-5 h-5" />
                        Tắt camera
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void startScanner()}
                        disabled={scannerState === "starting"}
                        className="py-3 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold hover:shadow-lg shadow-violet-200 disabled:opacity-60 flex items-center justify-center gap-2 transition-all"
                      >
                        {scannerState === "starting" ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Camera className="w-5 h-5" />
                        )}
                        {scannerState === "starting" ? "Đang mở camera..." : "Mở camera"}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={scannerState === "starting"}
                      className="py-3 rounded-xl bg-white border border-violet-200 text-violet-700 font-bold hover:bg-violet-50 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                    >
                      <ImageUp className="w-5 h-5" />
                      Chọn từ thư viện
                    </button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = "";
                      if (file) void scanImageFile(file);
                    }}
                  />
                  {scanError && (
                    <p className="mt-4 rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
                      {scanError}
                    </p>
                  )}

                  {/* Timi Security note */}
                  <div className="mt-5 flex items-start gap-3 p-4 rounded-xl bg-violet-50 border border-violet-100">
                    <ShieldCheck className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-violet-900">
                        Timi Security
                      </p>
                      <p className="text-xs text-violet-700 mt-0.5 leading-relaxed">
                        Chúng tôi sẽ kiểm tra mã QR để đảm bảo an toàn cho bạn.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== CREATE MODE ===== */}
              {mode === "create" && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-violet-100/80">
                  {!generatedQr ? (
                    <form onSubmit={handleCreate} className="space-y-5">
                      <div className="text-center mb-2">
                        <h2 className="text-lg font-bold text-slate-900">
                          Tạo mã QR nhận tiền
                        </h2>
                        <p className="text-sm text-slate-500 mt-1">
                          QR luôn nhận tiền về tài khoản Timi Bank của bạn
                        </p>
                      </div>

                      {/* Own account info */}
                      <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-3">
                          <Building2 className="h-5 w-5 text-violet-600" />
                          Tài khoản nhận tiền của bạn
                        </div>
                        <div className="grid gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-slate-500 text-xs">Ngân hàng</p>
                            <p className="font-semibold text-slate-900">Timi Bank</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Số tài khoản</p>
                            <p className="font-mono font-bold text-slate-900">
                              {ownAccountNumber || "Chưa cập nhật"}
                            </p>
                          </div>
                        </div>
                        <p className="mt-2 text-sm text-slate-500">
                          Chủ tài khoản:{" "}
                          <span className="font-semibold text-slate-800">
                            {ownAccountName || "Chưa cập nhật"}
                          </span>
                        </p>
                        {!canCreateOwnQr && (
                          <p className="mt-3 text-xs font-medium text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
                            Cần số điện thoại gồm đúng 10 chữ số và tài khoản Timi Bank
                            đang hoạt động để tạo QR.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Số tiền <span className="font-normal text-slate-400">(tuỳ chọn)</span>
                        </label>
                        <div className="relative">
                          <input
                            inputMode="numeric"
                            value={form.amount}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                amount: event.target.value.replace(/\D/g, ""),
                              })
                            }
                            placeholder="0"
                            className="w-full rounded-xl bg-slate-50 border border-transparent px-4 py-3 text-slate-900 font-semibold outline-none focus:ring-2 focus:ring-violet-400 transition-all"
                          />
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
                            VND
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                          Nội dung <span className="font-normal text-slate-400">(tuỳ chọn)</span>
                        </label>
                        <input
                          maxLength={500}
                          value={form.note}
                          onChange={(event) =>
                            setForm({ ...form, note: event.target.value })
                          }
                          placeholder="Ví dụ: Thanh toán đơn hàng"
                          className="w-full rounded-xl bg-slate-50 border border-transparent px-4 py-3 text-slate-800 outline-none focus:ring-2 focus:ring-violet-400 transition-all"
                        />
                      </div>

                      {createError && (
                        <p className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-sm text-rose-700">
                          {createError}
                        </p>
                      )}

                      <button
                        disabled={isCreating || !canCreateOwnQr}
                        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold hover:shadow-lg shadow-violet-200 disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                      >
                        {isCreating ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <QrCode className="w-5 h-5" />
                        )}
                        {isCreating ? "Đang tạo QR..." : "Tạo mã QR"}
                      </button>
                    </form>
                  ) : (
                    /* Generated QR display – matches Receive Money image */
                    <div className="flex flex-col items-center text-center">
                      <p className="text-sm font-semibold text-slate-500 mb-1">
                        Quét để mở yêu cầu thanh toán Timi
                      </p>
                      <p className="text-xs text-slate-400 mb-5">
                        Người gửi chưa đăng nhập sẽ đăng nhập rồi quay lại đúng giao dịch này
                      </p>

                      <div className="relative bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
                        <img
                          src={generatedQr.image}
                          alt="Mã QR thanh toán Timi"
                          className="w-full max-w-[280px] rounded-xl"
                        />
                        {/* Center shield badge like the image */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-xl bg-white shadow-md flex items-center justify-center border border-violet-100">
                            <Shield className="w-6 h-6 text-violet-600" />
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 flex gap-3 w-full max-w-xs">
                        <button
                          type="button"
                          onClick={downloadQr}
                          className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 flex items-center justify-center gap-2 transition-colors text-sm"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>
                        <button
                          type="button"
                          onClick={() => void shareQr()}
                          className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 flex items-center justify-center gap-2 transition-colors text-sm"
                        >
                          <Share2 className="w-4 h-4" />
                          Share
                        </button>
                      </div>

                      <div className="mt-5 w-full flex items-start gap-2.5 p-3.5 rounded-xl bg-violet-50 border border-violet-100 text-left">
                        <ShieldCheck className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-violet-800 leading-relaxed">
                          Mã QR của bạn được bảo vệ bởi{" "}
                          <span className="font-semibold">Timi Security</span>. Chỉ
                          chấp nhận thanh toán từ ứng dụng và ngân hàng đáng tin cậy.
                        </p>
                      </div>

                      <PaymentSummary payment={generatedQr.payment} compact />

                      <button
                        type="button"
                        onClick={() => setGeneratedQr(null)}
                        className="mt-4 text-sm font-semibold text-violet-600 hover:text-violet-700"
                      >
                        Tạo mã QR khác
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ---------- RIGHT COLUMN ---------- */}
            <div className="lg:col-span-5 space-y-4">
              {/* AI Protection / Security card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      Quét QR an toàn cùng Timi
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      QR thanh toán sẽ được chuyển sang trang Chuyển tiền. QR chứa đường
                      dẫn sẽ được kiểm tra tên miền, blacklist và các tín hiệu rủi ro ngay tại đây.
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction / Result panel */}
              {mode === "scan" && decodedContent ? (
                <DecodedQrSummary
                  content={decodedContent}
                  urlSafetyState={urlSafetyState}
                />
              ) : mode === "create" && !generatedQr ? (
                /* Request amount form style card (visual match to image 1) */
                <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl p-5 text-white shadow-lg shadow-violet-200/60">
                  <p className="text-sm font-semibold text-violet-100 mb-3">
                    Số tiền yêu cầu <span className="opacity-70">(không bắt buộc)</span>
                  </p>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-2xl font-bold">₫</span>
                    <input
                      inputMode="numeric"
                      value={form.amount}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          amount: e.target.value.replace(/\D/g, ""),
                        })
                      }
                      placeholder="0"
                      className="bg-transparent text-2xl font-bold text-white outline-none placeholder-white/40 w-full"
                    />
                    <span className="text-sm font-medium text-violet-200 shrink-0">
                      ₫VND
                    </span>
                  </div>
                  <input
                    value={form.note}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                    placeholder="Thêm lời nhắn cho người gửi (không bắt buộc)"
                    className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder-white/50 outline-none focus:bg-white/15 transition-colors mb-4"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      // Trigger the same create logic
                      const formEl = document.querySelector(
                        "form",
                      ) as HTMLFormElement | null;
                      if (formEl) formEl.requestSubmit();
                    }}
                    disabled={isCreating || !canCreateOwnQr}
                    className="w-full py-3 rounded-xl bg-white text-violet-700 font-bold hover:bg-violet-50 disabled:opacity-50 transition-colors"
                  >
                    {isCreating ? "Đang tạo..." : "Tạo yêu cầu thanh toán"}
                  </button>
                </div>
              ) : mode === "scan" ? (
                /* Empty scan state – URL safety analysis */
                <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80 min-h-[380px] flex flex-col">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Phân tích an toàn URL
                      </h3>
                      <p className="mt-1 text-xs leading-relaxed text-slate-500">
                        Timi sẽ phân tích đường dẫn được đọc từ mã QR trước khi cho phép truy cập.
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-1 flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center">
                      <Link2 className="w-7 h-7 text-violet-500" />
                    </div>
                    <h4 className="mt-4 text-sm font-bold text-slate-800">
                      Chưa có đường dẫn
                    </h4>
                    <p className="mt-2 max-w-[290px] text-xs leading-relaxed text-slate-500">
                      Quét mã QR chứa URL để kiểm tra tên miền, blacklist và các dấu hiệu có thể liên quan đến lừa đảo.
                    </p>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Tên miền
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">—</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Trạng thái
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-400">Chưa kiểm tra</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Tips card */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
                    <Info className="w-4 h-4 text-violet-600" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {mode === "scan" ? "Lưu ý khi quét" : "Lưu ý khi nhận tiền"}
                  </h3>
                </div>
                <ul className="space-y-2.5">
                  {(mode === "scan"
                    ? [
                        "Chỉ quét mã QR từ nguồn đáng tin cậy.",
                        "Kiểm tra kỹ thông tin người nhận trước khi thanh toán.",
                        "Timi sẽ cảnh báo nếu phát hiện mã QR có dấu hiệu rủi ro.",
                      ]
                    : [
                        "Chỉ chia sẻ mã QR với người bạn tin tưởng",
                        "Xác minh danh tính người gửi trước khi xác nhận",
                        "Liên hệ hỗ trợ nếu bạn phát hiện điều gì đáng ngờ",
                      ]
                  ).map((tip, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
                      <CheckCircle2 className="w-3.5 h-3.5 text-violet-500 shrink-0 mt-0.5" />
                      {tip}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => navigate("/help")}
                  className="mt-3 text-xs font-semibold text-violet-600 hover:text-violet-700 flex items-center gap-1"
                >
                  Tìm hiểu thêm về nhận tiền an toàn
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 px-4 sm:px-6 lg:px-8 pb-8 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <p>© 2024 Timi. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
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

      {/* Decorative wave — fixed full-width at bottom of viewport */}
      <div
        className="pointer-events-none fixed bottom-0 left-0 right-0 z-0 h-48 sm:h-56 md:h-72 overflow-hidden opacity-30 select-none"
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
    </div>
  );
}

function PaymentSummary({
  payment,
  compact = false,
}: {
  payment: PaymentQrData;
  compact?: boolean;
}) {
  const bank =
    payment.bankName ??
    paymentBanks.find((item) => item.code === payment.bankCode)?.name ??
    payment.bankCode;
  return (
    <div
      className={`w-full mt-5 rounded-2xl bg-slate-50 text-left border border-slate-100 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        Thông tin nhận tiền
      </p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Ngân hàng</span>
          <span className="font-semibold text-slate-800 text-right">{bank}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Số tài khoản</span>
          <span className="font-mono font-bold text-slate-900 text-right">
            {payment.accountNumber}
          </span>
        </div>
        {payment.accountName && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Người nhận</span>
            <span className="font-semibold text-slate-800 text-right">
              {payment.accountName}
            </span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Số tiền</span>
          <span className="font-bold text-violet-600 text-right">
            {formatMoney(payment.amount)}
          </span>
        </div>
        {payment.note && (
          <div className="flex justify-between gap-4">
            <span className="text-slate-500">Nội dung</span>
            <span className="font-medium text-slate-800 text-right break-words">
              {payment.note}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DecodedQrSummary({
  content,
  urlSafetyState,
}: {
  content: DecodedQrContent;
  urlSafetyState: UrlSafetyState;
}) {
  const [copyStatus, setCopyStatus] = useState("");

  if (content.kind === "payment") return null;

  const copyRawValue = async () => {
    try {
      await navigator.clipboard.writeText(content.rawValue);
      setCopyStatus("Đã sao chép nội dung QR.");
    } catch {
      setCopyStatus(
        "Không thể sao chép tự động. Hãy chọn và sao chép nội dung bên dưới.",
      );
    }
  };

  if (content.kind === "url") {
    const localRiskPresentation = {
      safe: {
        title: "Chưa thấy dấu hiệu bất thường",
        description: "",
        className: "border-emerald-100 bg-emerald-50 text-emerald-800",
        icon: ShieldCheck,
      },
      caution: {
        title: "Link cần kiểm tra thêm",
        description:
          "Link có một số đặc điểm thường dùng để che giấu địa chỉ đích.",
        className: "border-amber-100 bg-amber-50 text-amber-900",
        icon: AlertTriangle,
      },
      danger: {
        title: "Không mở tự động",
        description:
          "Link không hợp lệ hoặc có tín hiệu rủi ro cao. Timi đã chặn thao tác mở từ màn hình này.",
        className: "border-rose-100 bg-rose-50 text-rose-800",
        icon: ShieldAlert,
      },
    }[content.riskLevel];
    const isBlacklisted = urlSafetyState.status === "blocked";
    const riskPresentation = isBlacklisted
      ? {
          title: "Đã chặn link lừa đảo",
          description: urlSafetyState.reason,
          className: "border-rose-200 bg-rose-50 text-rose-800",
          icon: ShieldAlert,
        }
      : localRiskPresentation;
    const RiskIcon = riskPresentation.icon;
    // The database blacklist is the access-control decision. Local signals
    // remain visible to help the user judge a link, but a URL that is not
    // blacklisted can be opened immediately once the API has confirmed it.
    const mayOpen =
      content.normalizedUrl !== null && urlSafetyState.status === "clear";
    const mayCopy = !isBlacklisted;
    const safetyStatus =
      urlSafetyState.status === "checking"
        ? "Đang đối chiếu tên miền với blacklist URL…"
        : urlSafetyState.status === "unavailable"
          ? "Không thể đối chiếu blacklist URL. Timi sẽ không mở link này."
          : urlSafetyState.status === "clear"
            ? "Tên miền không nằm trong blacklist URL hiện tại."
            : null;

    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80 flex flex-col min-h-[380px]">
        <div className="flex items-start gap-3 text-slate-800">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <span className="font-bold text-sm">Phân tích an toàn URL</span>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Kết quả kiểm tra đường dẫn được đọc từ mã QR.
            </p>
          </div>
        </div>

        <div className={`mt-4 rounded-xl border p-3.5 ${riskPresentation.className}`}>
          <div className="flex items-start gap-2.5">
            <RiskIcon className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-bold text-sm">{riskPresentation.title}</p>
              {riskPresentation.description && (
                <p className="mt-1 text-xs leading-relaxed">
                  {riskPresentation.description}
                </p>
              )}
            </div>
          </div>
        </div>

        {safetyStatus && (
          <p
            className={`mt-3 rounded-xl px-3 py-2 text-xs ${
              urlSafetyState.status === "unavailable"
                ? "bg-amber-50 text-amber-800"
                : "bg-slate-50 text-slate-600"
            }`}
          >
            {urlSafetyState.status === "checking" && (
              <Loader2 className="mr-1.5 inline h-3.5 w-3.5 animate-spin" />
            )}
            {safetyStatus}
          </p>
        )}

        <div className="mt-4 rounded-xl bg-slate-50 p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Tên miền nhận diện
          </p>
          <p className="mt-1 break-all font-semibold text-slate-900 text-sm">
            {content.hostname ?? "Không xác định được tên miền"}
          </p>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Địa chỉ URL
          </p>
          <p className="mt-1 max-h-24 overflow-y-auto break-all rounded-lg bg-white px-2.5 py-2 font-mono text-[11px] leading-relaxed text-slate-700">
            {content.rawValue}
          </p>
        </div>

        {content.signals.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-bold text-slate-800">Tín hiệu cần lưu ý</p>
            <ul className="mt-1.5 space-y-1.5">
              {content.signals.map((signal) => (
                <li
                  key={signal.code}
                  className="flex gap-2 text-xs leading-relaxed text-slate-600"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                  {signal.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-auto space-y-2.5 pt-5">
          {copyStatus && (
            <p className="text-center text-[11px] text-slate-500">{copyStatus}</p>
          )}
          {mayCopy && (
            <button
              type="button"
              onClick={() => void copyRawValue()}
              className="w-full rounded-xl bg-slate-100 py-2.5 font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center gap-2 text-sm transition-colors"
            >
              <Copy className="w-4 h-4" />
              Sao chép
            </button>
          )}
          {mayOpen && (
            <button
              type="button"
              onClick={() =>
                window.open(content.normalizedUrl!, "_blank", "noopener,noreferrer")
              }
              className={`w-full rounded-xl py-2.5 font-bold text-white flex items-center justify-center gap-2 text-sm transition-colors ${
                content.riskLevel === "caution"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-violet-600 hover:bg-violet-700"
              }`}
            >
              <ExternalLink className="w-4 h-4" />
              Truy cập website
            </button>
          )}
        </div>
      </div>
    );
  }

  const nonLinkContent = {
    wifi: {
      title: "Thông tin Wi-Fi",
      description: "Timi không tự kết nối vào mạng Wi-Fi từ QR này.",
      icon: Wifi,
    },
    contact: {
      title: "Danh thiếp",
      description: "Timi không tự thêm liên hệ từ QR này.",
      icon: FileText,
    },
    phone: {
      title: "Số điện thoại",
      description: "Timi không tự gọi số điện thoại từ QR này.",
      icon: FileText,
    },
    email: {
      title: "Địa chỉ email",
      description: "Timi không tự tạo email từ QR này.",
      icon: FileText,
    },
    sms: {
      title: "Tin nhắn",
      description: "Timi không tự gửi tin nhắn từ QR này.",
      icon: FileText,
    },
    text: {
      title: "Nội dung văn bản",
      description: "Nội dung được đọc từ mã QR.",
      icon: FileText,
    },
  }[content.kind];
  const ContentIcon = nonLinkContent.icon;

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-violet-100/80 flex flex-col min-h-[380px]">
      <div className="flex items-center gap-2 text-slate-800">
        <ContentIcon className="w-5 h-5 text-violet-600" />
        <span className="font-bold text-sm">{nonLinkContent.title}</span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-500">
        {nonLinkContent.description}
      </p>
      <div className="mt-4 max-h-56 overflow-y-auto rounded-xl bg-slate-50 p-3.5">
        <p className="break-all whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-700">
          {content.rawValue}
        </p>
      </div>
      <div className="mt-auto space-y-2.5 pt-5">
        {copyStatus && (
          <p className="text-center text-[11px] text-slate-500">{copyStatus}</p>
        )}
        <button
          type="button"
          onClick={() => void copyRawValue()}
          className="w-full rounded-xl bg-slate-100 py-2.5 font-bold text-slate-700 hover:bg-slate-200 flex items-center justify-center gap-2 text-sm transition-colors"
        >
          <Copy className="w-4 h-4" />
          Sao chép
        </button>
      </div>
    </div>
  );
}
