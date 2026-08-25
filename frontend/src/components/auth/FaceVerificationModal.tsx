import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, ScanFace, Shield, ShieldAlert } from "lucide-react";
import { authApi } from "@/services/api/auth";

export interface FaceMatchResult {
  matched: boolean;
  similarity: number;
  threshold: number;
  message: string;
  verification_token?: string | null;
}

interface Props {
  onVerified: (
    imageData: string | string[],
    pin?: string,
  ) => Promise<FaceMatchResult>;
  onVerificationComplete?: (result: FaceMatchResult) => void | Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  onSetupFace?: () => void;
  mode?: "verification" | "enrollment";
}

type FrameQuality = "checking" | "holding" | "ready" | "invalid";

const CAPTURE_DELAYS_MS = [0, 240, 480];
const SUCCESS_CONFIRM_DELAY_MS = 900;

function sleep(delay: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, delay));
}

function errorMessage(error: unknown) {
  const response = error as {
    response?: {
      status?: number;
      data?: {
        detail?: unknown;
      };
    };
    message?: string;
  };
  const detail = response.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && "msg" in item && typeof item.msg === "string"
          ? item.msg
          : null,
      )
      .filter((message): message is string => Boolean(message));
    if (messages.length > 0) return messages.join(". ");
  }
  return response.message || "Không thể xác thực khuôn mặt. Hãy thử lại.";
}

export default function FaceVerificationModal({
  onVerified,
  onVerificationComplete,
  onCancel,
  isLoading,
  onSetupFace,
  mode = "verification",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stableTimerRef = useRef<number | null>(null);
  const verificationTimerRefs = useRef<number[]>([]);
  const qualityRequestId = useRef(0);
  const qualityCheckInFlight = useRef(false);
  const qualityReadyRef = useRef(false);
  const qualityPollingStoppedRef = useRef(false);
  const invalidQualityStreakRef = useRef(0);
  const autoCaptureBlockedRef = useRef(false);
  const hadLockoutRef = useRef(false);
  const verifyRef = useRef<(automatic?: boolean) => Promise<void>>(async () => undefined);

  const [cameraReady, setCameraReady] = useState(false);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccessHolding, setIsSuccessHolding] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FaceMatchResult | null>(null);
  const [needsFaceSetup, setNeedsFaceSetup] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [frameQuality, setFrameQuality] = useState<FrameQuality>("checking");
  const [frameQualityMessage, setFrameQualityMessage] = useState(
    "Đặt khuôn mặt vào giữa khung để bắt đầu.",
  );
  const [frameBrightness, setFrameBrightness] = useState(128);
  const [scanProgress, setScanProgress] = useState(0);
  // After a rejected capture, the camera may continue checking that the face
  // is positioned correctly.  That must not look like a new verification
  // attempt: only the user's explicit "Thử lại" starts a fresh progress ring.
  const [awaitingManualRetry, setAwaitingManualRetry] = useState(false);

  const isEnrollment = mode === "enrollment";
  const isLockedOut = lockoutSeconds > 0;
  const isRequestBusy = isLoading || isSubmitting;
  const isBusy = isRequestBusy || isSuccessHolding;
  const faceTitle = isEnrollment ? "Đăng ký khuôn mặt" : "Xác thực khuôn mặt";
  const faceDescription = isEnrollment
    ? "Giữ khuôn mặt trong khung. Hệ thống sẽ tự thu một đoạn hình ngắn để kiểm tra người thật."
    : "Giữ khuôn mặt trong khung. Hệ thống sẽ tự kiểm tra người thật và đối chiếu an toàn.";
  const scanProgressLabel =
    scanProgress >= 100
      ? "Hoàn tất"
      : scanProgress >= 92
        ? "Đang đối chiếu khuôn mặt"
        : scanProgress >= 78
          ? "Đang kiểm tra người thật"
          : scanProgress >= 55
            ? "Đang thu mẫu camera"
            : scanProgress >= 45
              ? "Khuôn mặt đã sẵn sàng"
              : "Đang căn khuôn mặt";

  const clearTimers = useCallback(() => {
    if (stableTimerRef.current !== null) {
      window.clearTimeout(stableTimerRef.current);
      stableTimerRef.current = null;
    }
    verificationTimerRefs.current.forEach((timerId) => window.clearTimeout(timerId));
    verificationTimerRefs.current = [];
  }, []);

  const stopCamera = useCallback(() => {
    clearTimers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [clearTimers]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (!isLockedOut) {
      if (hadLockoutRef.current) {
        hadLockoutRef.current = false;
        setError("");
        setFrameQuality("checking");
        setFrameQualityMessage("Đưa mặt vào giữa khung để thử lại.");
      }
      return;
    }
    hadLockoutRef.current = true;
    const timerId = window.setInterval(() => {
      setLockoutSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [isLockedOut]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollTop = window.scrollY;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      window.scrollTo({ top: scrollTop, left: 0, behavior: "auto" });
    };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!cameraReady || !video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {
      setError("Không thể phát hình từ camera. Hãy thử mở lại camera.");
    });
  }, [cameraReady]);

  const captureFrame = () => {
    if (document.visibilityState !== "visible") {
      throw new Error("Hãy quay lại màn hình xác thực trước khi tiếp tục.");
    }
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || track.readyState !== "live" || track.muted) {
      throw new Error("Luồng camera không còn hoạt động. Hãy mở lại camera.");
    }
    const video = videoRef.current;
    if (!videoLoaded || !video?.videoWidth || !video.videoHeight) {
      throw new Error("Camera chưa sẵn sàng. Hãy thử lại.");
    }

    const cropSize = Math.min(video.videoWidth, video.videoHeight);
    const cropX = (video.videoWidth - cropSize) / 2;
    const cropY = (video.videoHeight - cropSize) / 2;
    const outputSize = Math.min(512, cropSize);
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Không thể chuẩn bị ảnh từ camera.");
    if (frameBrightness < 110) {
      context.filter = `brightness(${Math.min(1.3, 128 / Math.max(frameBrightness, 48))}) contrast(1.06)`;
    }
    context.save();
    context.translate(outputSize, 0);
    context.scale(-1, 1);
    context.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, outputSize, outputSize);
    context.restore();
    context.filter = "none";
    return canvas.toDataURL("image/jpeg", 0.88);
  };

  const collectCaptureBurst = async (startProgress: number) => {
    const frames: string[] = [];
    let previousDelay = 0;
    for (const [index, delay] of CAPTURE_DELAYS_MS.entries()) {
      const wait = delay - previousDelay;
      if (wait > 0) await sleep(wait);
      previousDelay = delay;
      frames.push(captureFrame());
      setScanProgress(
        startProgress
          + Math.round(((index + 1) / CAPTURE_DELAYS_MS.length) * (76 - startProgress)),
      );
    }
    return frames;
  };

  const verify = async (automatic = false) => {
    if (isBusy || isLockedOut || !qualityReadyRef.current) return;
    clearTimers();
    const captureStartProgress = automatic ? 55 : 15;
    if (!automatic) {
      autoCaptureBlockedRef.current = false;
      setAwaitingManualRetry(false);
    }
    setError("");
    setResult(null);
    setIsSuccessHolding(false);
    setNeedsFaceSetup(false);
    setIsSubmitting(true);
    setFrameQuality("holding");
    if (automatic) {
      setFrameQualityMessage("Đang thu mẫu từ camera trực tiếp...");
      setScanProgress((progress) => Math.max(progress, captureStartProgress));
    } else {
      // A manual retry is a new bank-style verification transaction. Render
      // an empty ring first, then scan through every stage from the beginning.
      setCapturedImage(null);
      setScanProgress(0);
      setFrameQualityMessage("Đang bắt đầu lượt quét mới...");
      await sleep(260);
      setScanProgress(captureStartProgress);
      setFrameQualityMessage("Đang thu lại mẫu camera trực tiếp...");
    }
    try {
      const frames = await collectCaptureBurst(captureStartProgress);
      setCapturedImage(frames[frames.length - 1]);
      setScanProgress(78);
      setFrameQualityMessage("Đang kiểm tra người thật...");
      verificationTimerRefs.current = [
        window.setTimeout(() => {
          setScanProgress((progress) => Math.max(progress, 86));
          setFrameQualityMessage("Đang phân tích Passive Liveness...");
        }, 300),
        window.setTimeout(() => {
          setScanProgress((progress) => Math.max(progress, 94));
          setFrameQualityMessage("Đang đối chiếu với khuôn mặt đã đăng ký...");
        }, 900),
      ];
      const match = await onVerified(frames);
      clearTimers();
      if (match.matched) {
        qualityReadyRef.current = false;
        setScanProgress(100);
        setFrameQuality("ready");
        setFrameQualityMessage("Đã quét đủ. Đang hoàn tất xác thực...");
        setIsSubmitting(false);
        setIsSuccessHolding(true);
        // Let the 420 ms ring transition reach 100%, then keep the completed
        // state visible briefly before the parent navigates or mutates data.
        await sleep(SUCCESS_CONFIRM_DELAY_MS);
        setResult(match);
        setFrameQualityMessage("Xác thực thành công.");
        await onVerificationComplete?.(match);
        setIsSuccessHolding(false);
        stopCamera();
        setCameraReady(false);
      } else {
        setResult(match);
        autoCaptureBlockedRef.current = true;
        setAwaitingManualRetry(true);
        qualityReadyRef.current = false;
        qualityPollingStoppedRef.current = false;
        setCapturedImage(null);
        setScanProgress(0);
        setFrameQuality("checking");
        setFrameQualityMessage("Hãy giữ khuôn mặt trong khung để thử lại.");
      }
    } catch (requestError) {
      clearTimers();
      // A server-side liveness/match rejection must not immediately trigger
      // another automatic submission. Keep the camera ready and let the user
      // correct lighting/position, then choose "Xác thực khuôn mặt" to retry.
      autoCaptureBlockedRef.current = true;
      const message = errorMessage(requestError);
      const statusCode = (requestError as { response?: { status?: number } }).response?.status;
      if (statusCode === 429) {
        const secondsFromMessage = Number(message.match(/(\d+)\s*giây/i)?.[1] ?? 30);
        setLockoutSeconds(Math.max(1, secondsFromMessage));
      }
      if (statusCode === 409) setNeedsFaceSetup(true);
      setError(message);
      setResult(null);
      setCapturedImage(null);
      setAwaitingManualRetry(true);
      qualityReadyRef.current = false;
      qualityPollingStoppedRef.current = false;
      setScanProgress(0);
      setFrameQuality("checking");
      setFrameQualityMessage(
        statusCode === 429
          ? "Face ID đang tạm khóa để bảo vệ tài khoản."
          : "Hãy giữ khuôn mặt trong khung để thử lại.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  verifyRef.current = verify;

  useEffect(() => {
    if (!cameraReady || !videoLoaded || isBusy || isLockedOut) return;
    const video = videoRef.current;
    if (!video) return;
    const brightnessCanvas = document.createElement("canvas");
    brightnessCanvas.width = 64;
    brightnessCanvas.height = 64;
    const brightnessContext = brightnessCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    const qualityCanvas = document.createElement("canvas");
    qualityCanvas.width = 256;
    qualityCanvas.height = 256;
    const qualityContext = qualityCanvas.getContext("2d");
    if (!brightnessContext || !qualityContext) return;

    const resetReadiness = (message: string) => {
      qualityReadyRef.current = false;
      invalidQualityStreakRef.current = 0;
      if (stableTimerRef.current !== null) {
        window.clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
      qualityPollingStoppedRef.current = false;
      setScanProgress((progress) => (progress >= 45 ? 25 : progress));
      setFrameQuality("invalid");
      setFrameQualityMessage(message);
    };

    const inspectFrame = () => {
      // One accepted frame starts the stability window. Polling again during
      // that window allowed a transient detector miss to cancel its timer and
      // left the UI permanently at “Đang giữ ổn định…”.
      if (
        !video.videoWidth ||
        !video.videoHeight ||
        qualityCheckInFlight.current ||
        qualityReadyRef.current ||
        qualityPollingStoppedRef.current ||
        stableTimerRef.current !== null
      ) return;
      brightnessContext.drawImage(video, 0, 0, 64, 64);
      const pixels = brightnessContext.getImageData(0, 0, 64, 64).data;
      let brightnessTotal = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        brightnessTotal += 0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2];
      }
      const brightness = brightnessTotal / (pixels.length / 4);
      setFrameBrightness(brightness);
      if (brightness < 45) {
        resetReadiness("Ánh sáng quá yếu. Hãy bật đèn hoặc đến nơi sáng hơn.");
        return;
      }
      if (brightness > 225) {
        resetReadiness("Ảnh đang bị chói. Hãy tránh ánh sáng chiếu thẳng vào camera.");
        return;
      }

      const cropSize = Math.min(video.videoWidth, video.videoHeight);
      const cropX = (video.videoWidth - cropSize) / 2;
      const cropY = (video.videoHeight - cropSize) / 2;
      qualityContext.save();
      qualityContext.translate(256, 0);
      qualityContext.scale(-1, 1);
      qualityContext.drawImage(video, cropX, cropY, cropSize, cropSize, 0, 0, 256, 256);
      qualityContext.restore();

      qualityCheckInFlight.current = true;
      const requestId = ++qualityRequestId.current;
      void authApi
        .checkFaceQuality(qualityCanvas.toDataURL("image/jpeg", 0.84))
        .then((quality) => {
          if (requestId !== qualityRequestId.current) return;
          if (!quality.ready) {
            invalidQualityStreakRef.current += 1;
            // Face detection can miss a single webcam frame because of focus
            // hunting or compression. Do not restart the whole capture for
            // one transient miss; two consecutive misses are meaningful.
            if (invalidQualityStreakRef.current < 2) {
              setFrameQuality("holding");
              setFrameQualityMessage("Đang giữ ổn định khuôn mặt trong khung...");
              return;
            }
            resetReadiness(quality.message);
            return;
          }
          invalidQualityStreakRef.current = 0;
          if (qualityReadyRef.current) return;
          setScanProgress((progress) => Math.max(progress, 25));
          if (stableTimerRef.current !== null) return;
          setFrameQuality("holding");
          setFrameQualityMessage("Đã nhận diện khuôn mặt. Hãy giữ yên trong giây lát...");
          stableTimerRef.current = window.setTimeout(() => {
            stableTimerRef.current = null;
            qualityReadyRef.current = true;
            qualityPollingStoppedRef.current = true;
            setScanProgress(45);
            setFrameQuality("ready");
            if (autoCaptureBlockedRef.current) {
              // Do not create a retry loop after a server rejection. Keep the
              // previous error visible and make the manual next action clear.
              setFrameQualityMessage("Khuôn mặt đã sẵn sàng. Nhấn Thử lại xác thực bên dưới.");
              return;
            }
            // This is the one automatic attempt for the current camera state.
            // Calling directly avoids a second timer that could be cancelled
            // by effect cleanup before it ever submitted /face/verify.
            setFrameQualityMessage("Khuôn mặt đã sẵn sàng. Đang kiểm tra người thật...");
            void verifyRef.current(true);
          }, 800);
        })
        .catch(() => {
          if (requestId !== qualityRequestId.current) return;
          invalidQualityStreakRef.current += 1;
          if (invalidQualityStreakRef.current >= 2) {
            resetReadiness("Đưa mặt vào giữa khung, giữ yên và đảm bảo đủ sáng.");
          }
        })
        .finally(() => {
          qualityCheckInFlight.current = false;
        });
    };

    inspectFrame();
    const intervalId = window.setInterval(inspectFrame, 500);
    return () => {
      window.clearInterval(intervalId);
      qualityRequestId.current += 1;
    };
  }, [cameraReady, isBusy, isLockedOut, videoLoaded]);

  const startCamera = async () => {
    setError("");
    setResult(null);
    setNeedsFaceSetup(false);
    setCapturedImage(null);
    setVideoLoaded(false);
    setIsSuccessHolding(false);
    setFrameQuality("checking");
    setFrameQualityMessage("Đang mở camera trực tiếp...");
    setScanProgress(0);
    setAwaitingManualRetry(false);
    qualityReadyRef.current = false;
    qualityPollingStoppedRef.current = false;
    invalidQualityStreakRef.current = 0;
    autoCaptureBlockedRef.current = false;
    clearTimers();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          frameRate: { ideal: 30, min: 24 },
        },
        audio: false,
      });
      stopCamera();
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      if (!track || track.readyState !== "live") {
        stopCamera();
        throw new Error("Không nhận được luồng camera trực tiếp.");
      }
      const capabilities = track.getCapabilities() as MediaTrackCapabilities & {
        focusMode?: string[];
        exposureMode?: string[];
        whiteBalanceMode?: string[];
      };
      const advanced: Record<string, string> = {};
      if (capabilities.focusMode?.includes("continuous")) advanced.focusMode = "continuous";
      if (capabilities.exposureMode?.includes("continuous")) advanced.exposureMode = "continuous";
      if (capabilities.whiteBalanceMode?.includes("continuous")) advanced.whiteBalanceMode = "continuous";
      if (Object.keys(advanced).length > 0) {
        await track.applyConstraints({ advanced: [advanced] } as MediaTrackConstraints);
      }
      setCameraReady(true);
    } catch (cameraError) {
      setError(errorMessage(cameraError) || "Không thể mở camera. Hãy cấp quyền camera và thử lại.");
      setCameraReady(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/55 p-3 sm:items-center sm:p-5 backdrop-blur-sm">
      <div className="my-auto w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/75 bg-white p-5 shadow-2xl shadow-slate-950/30 sm:p-6">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-200">
          <ScanFace className="h-7 w-7 text-white" />
        </div>
        <h2 className="mt-4 text-center text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {faceTitle}
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-slate-500">{faceDescription}</p>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-violet-100 bg-violet-50/80 px-3.5 py-2.5">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <p className="text-xs font-medium leading-relaxed text-violet-800">
            Passive Liveness sẽ chặn ảnh, màn hình và video giả. Camera chỉ dùng trong phiên xác thực này.
          </p>
        </div>

        <div className="relative mt-5 aspect-square overflow-hidden rounded-2xl bg-slate-900 ring-2 ring-violet-100">
          {cameraReady ? (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              onLoadedMetadata={() => setVideoLoaded(true)}
              onCanPlay={() => setVideoLoaded(true)}
              className="h-full w-full -scale-x-100 object-cover object-center"
              style={{
                filter: `${frameBrightness < 110 ? `brightness(${Math.min(1.3, 128 / Math.max(frameBrightness, 48))}) ` : ""}contrast(1.1) saturate(1.04)`,
              }}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-300">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10">
                <Camera className="h-7 w-7" />
              </div>
              <span className="text-sm">Mở camera để bắt đầu xác thực.</span>
            </div>
          )}
          {capturedImage && (
            <img
              src={capturedImage}
              alt="Khung hình khuôn mặt vừa thu để xác thực"
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
          )}
          {cameraReady && (
            <>
              <div className="pointer-events-none absolute inset-[16%] rounded-full border-2 border-white/60 shadow-[0_0_0_999px_rgba(15,23,42,.18)]" />
              {!awaitingManualRetry && (
                <>
                  <svg
                    className="pointer-events-none absolute inset-[13%] h-[74%] w-[74%] -rotate-90 overflow-visible"
                    viewBox="0 0 100 100"
                    aria-label={scanProgressLabel}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={scanProgress}
                    role="progressbar"
                  >
                    <ellipse cx="50" cy="50" rx="46" ry="46" fill="none" pathLength="100" stroke="rgba(167, 243, 208, 0.35)" strokeWidth="1.5" />
                    <ellipse
                      cx="50"
                      cy="50"
                      rx="46"
                      ry="46"
                      fill="none"
                      pathLength="100"
                      stroke={scanProgress === 100 ? "#16a34a" : "#34d399"}
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeDasharray="100"
                      strokeDashoffset={100 - scanProgress}
                      style={{
                        filter: "drop-shadow(0 0 4px rgba(52, 211, 153, 0.8))",
                        transition: "stroke-dashoffset 420ms cubic-bezier(0.22, 1, 0.36, 1), stroke 300ms ease",
                      }}
                    />
                  </svg>
                  <div className="pointer-events-none absolute inset-x-5 top-[17%] text-center text-[11px] font-bold tracking-wide text-emerald-100 drop-shadow">
                    {scanProgressLabel}
                  </div>
                </>
              )}
              {!isBusy && !capturedImage && (
                <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-slate-950/70 px-3 py-2 text-center text-xs font-medium text-white backdrop-blur-sm">
                  Đặt mặt gần, ở giữa khung và giữ yên trong ánh sáng đều.
                </div>
              )}
              {(frameQuality !== "ready" || autoCaptureBlockedRef.current) && !isBusy && (
                <div className={`pointer-events-none absolute inset-x-3 top-3 rounded-xl px-3 py-2 text-center text-xs font-semibold backdrop-blur-sm ${autoCaptureBlockedRef.current && frameQuality === "ready" ? "bg-amber-950/85 text-amber-100" : "bg-violet-950/80 text-violet-100"}`}>
                  {frameQualityMessage}
                </div>
              )}
            </>
          )}
          {isRequestBusy && !isSuccessHolding && (
            <div className="pointer-events-none absolute inset-x-3 top-3 flex items-center justify-center gap-2 rounded-xl bg-slate-950/80 px-3 py-2.5 text-center text-xs font-semibold text-white backdrop-blur-sm">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-300" />
              <span>{frameQualityMessage}</span>
            </div>
          )}
        </div>

        {error && (
          <p className="mt-4 flex gap-2.5 rounded-xl border border-rose-100 bg-rose-50 p-3.5 text-sm leading-5 text-rose-700">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {needsFaceSetup && onSetupFace && (
          <button
            type="button"
            onClick={onSetupFace}
            className="mt-3 w-full rounded-xl border border-amber-200 bg-amber-50 py-3 text-sm font-bold text-amber-900 transition-colors hover:bg-amber-100"
          >
            Đi tới cài đặt khuôn mặt
          </button>
        )}

        {result && (
          <p className={`mt-3 rounded-xl border p-3.5 text-sm ${result.matched ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-rose-100 bg-rose-50 text-rose-700"}`}>
            {result.message}
          </p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => {
              stopCamera();
              onCancel();
            }}
            disabled={isBusy}
            className="flex-1 rounded-xl bg-slate-100 px-4 py-3.5 font-semibold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-50"
          >
            Hủy
          </button>
          {!cameraReady ? (
            <button
              type="button"
              onClick={() => void startCamera()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white shadow-md shadow-violet-200 transition-all hover:shadow-lg"
            >
              <Camera className="h-4 w-4" />
              Mở camera
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void verify(false)}
              disabled={isBusy || isLockedOut || !videoLoaded || frameQuality !== "ready"}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3.5 font-semibold text-white shadow-md shadow-violet-200 transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {isBusy && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLockedOut
                ? `Thử lại sau ${lockoutSeconds}s`
                : isSuccessHolding
                ? "Đang hoàn tất..."
                : isBusy
                  ? "Đang xác thực..."
                : autoCaptureBlockedRef.current
                  ? "Thử lại xác thực"
                  : "Xác thực khuôn mặt"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
