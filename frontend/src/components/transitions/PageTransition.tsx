import { useEffect, useState, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import TimiLogo from "@/components/brand/TimiLogo";

interface PageTransitionProps {
  children: ReactNode;
  /**
   * Thời gian hiển thị logo reveal (ms).
   * @default 120
   */
  revealDuration?: number;
  /**
   * Thời gian overlay biến mất (ms).
   * @default 120
   */
  exitDuration?: number;
  /**
   * Thời gian chờ tối thiểu giữa các lần chuyển route (ms).
   * Tránh flicker khi navigate nhanh.
   * @default 0
   */
  minTransitionInterval?: number;
}

/**
 * PageTransition — Logo Reveal + Curtain Wipe
 *
 * Wrap toàn bộ <Routes> trong App.tsx:
 *
 *   <PageTransition>
 *     <Routes>...</Routes>
 *   </PageTransition>
 *
 * Hiệu ứng:
 *  1. Overlay gradient violet -> fuchsia che toàn màn hình (z-9999)
 *  2. Logo Shield + "Timi" scale từ 0.4 -> 1, opacity 0 -> 1
 *  3. Loading dots nhấp nháy
 *  4. Overlay translateY(-100%) hoặc opacity 0 để reveal page
 *  5. Page content có fade-in + translateY nhẹ
 */
export default function PageTransition({
  children,
  revealDuration = 120,
  exitDuration = 120,
  minTransitionInterval = 0,
}: PageTransitionProps) {
  const location = useLocation();
  const [phase, setPhase] = useState<"idle" | "revealing" | "exiting" | "done">(
    "revealing",
  );
  const [displayChildren, setDisplayChildren] = useState(children);
  const lastTransitionTime = useRef<number>(0);
  const pendingChildren = useRef<ReactNode>(children);
  const previousPathRef = useRef(location.pathname);

  // Track children change
  useEffect(() => {
    pendingChildren.current = children;
  }, [children]);

  // Trigger transition on route change
  useEffect(() => {
    // Every route starts at the top. Run once immediately and once after
    // route/modal cleanup so a previously locked body cannot restore the old
    // page position over the new route.
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    resetScroll();
    const resetFrame = window.requestAnimationFrame(resetScroll);
    // The route effect and the child-tracking effect run independently. On a
    // browser Back/reload, make the current route's tree the transition
    // payload immediately instead of briefly retaining the previous page.
    pendingChildren.current = children;
    const previousPath = previousPathRef.current;
    const isLoginCompletion = previousPath === "/login"
      && ["/dashboard", "/admin", "/confirm-location"].includes(location.pathname);
    previousPathRef.current = location.pathname;
    const now = Date.now();
    const timeSinceLast = now - lastTransitionTime.current;

    // Nếu vừa transition xong, chờ thêm chút để tránh flicker
    if (timeSinceLast < minTransitionInterval && phase === "done") {
      const delay = minTransitionInterval - timeSinceLast;
      const timer = window.setTimeout(() => {
          const cleanup = startTransition(isLoginCompletion);
          return cleanup;
        }, delay);
      return () => window.clearTimeout(timer);
    }

    const cleanup = startTransition(isLoginCompletion);
    return () => {
      cleanup?.();
      window.cancelAnimationFrame(resetFrame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function startTransition(isLoginCompletion = false) {
    // Authentication already waited on the OAuth popup and server verification.
    // Keep the brand cue, but do not add another noticeable pause before app use.
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const currentRevealDuration = reduceMotion
      ? 0
      : isLoginCompletion
      ? Math.min(revealDuration, 120)
      : revealDuration;
    const currentExitDuration = reduceMotion
      ? 0
      : isLoginCompletion
      ? Math.min(exitDuration, 100)
      : exitDuration;
    lastTransitionTime.current = Date.now();
    setPhase("revealing");
    setDisplayChildren(pendingChildren.current);

    // Bắt đầu exit sau revealDuration
    const exitTimer = window.setTimeout(() => {
      setPhase("exiting");
    }, currentRevealDuration);

    // Hoàn tất sau revealDuration + exitDuration
    const doneTimer = window.setTimeout(() => {
      setPhase("done");
    }, currentRevealDuration + currentExitDuration);

    return () => {
      window.clearTimeout(exitTimer);
      window.clearTimeout(doneTimer);
    };
  }

  const isOverlayVisible = phase === "revealing" || phase === "exiting";
  const isRevealing = phase === "revealing";

  return (
    <>
      {/* ===== OVERLAY ===== */}
      {isOverlayVisible && (
        <div
          className={`
            fixed inset-0 z-[9999] flex flex-col items-center justify-center
            transition-all ease-[cubic-bezier(0.76,0,0.24,1)]
            ${
              isRevealing
                ? "translate-y-0 opacity-100"
                : "-translate-y-full opacity-0"
            }
          `}
          style={{
            transitionDuration: isRevealing ? "0ms" : `${exitDuration}ms`,
            background:
              "linear-gradient(135deg, #7c3aed 0%, #a855f7 45%, #d946ef 100%)",
          }}
        >
          {/* Decorative circles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-fuchsia-300/15 rounded-full blur-3xl" />
            <div className="absolute top-1/2 right-1/3 w-32 h-32 bg-violet-200/10 rounded-full blur-2xl" />
          </div>

          {/* Logo Container */}
          <div
            className={`
              relative flex flex-col items-center gap-5
              transition-all ease-[cubic-bezier(0.34,1.56,0.64,1)]
              ${
                isRevealing
                  ? "scale-100 opacity-100 translate-y-0"
                  : "scale-90 opacity-0 -translate-y-4"
              }
            `}
            style={{
              transitionDuration: isRevealing ? "600ms" : `${exitDuration}ms`,
              transitionDelay: isRevealing ? "200ms" : "0ms",
            }}
          >
            {/* Logo Mark */}
            <div
              className="relative"
              style={{
                animation: isRevealing
                  ? "timi-logo-pulse 2s ease-in-out infinite"
                  : "none",
              }}
            >
              <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center shadow-2xl shadow-violet-950/40">
                <TimiLogo className="h-full w-full rounded-3xl" />
              </div>
              {/* Glow ring */}
              <div
                className="absolute inset-0 rounded-3xl border-2 border-white/40"
                style={{
                  animation: isRevealing
                    ? "timi-logo-ring 2s ease-out infinite"
                    : "none",
                }}
              />
            </div>

            {/* Brand Name */}
            <div className="text-center">
              <h1 className="text-4xl font-black text-white tracking-tight">
                Timi
              </h1>
              <p className="text-sm text-violet-100 font-medium mt-1 tracking-wide">
                AI Financial Guardian
              </p>
            </div>

            {/* Loading Dots */}
            <div className="flex items-center gap-2 mt-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-2 h-2 bg-white/80 rounded-full"
                  style={{
                    animation: isRevealing
                      ? `timi-dot-bounce 1.2s ease-in-out ${i * 0.15}s infinite`
                      : "none",
                  }}
                />
              ))}
            </div>
          </div>

          {/* Progress bar at bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
            <div
              className="h-full bg-white/70 rounded-r-full"
              style={{
                width: isRevealing ? "100%" : "0%",
                transition: isRevealing
                  ? `width ${revealDuration}ms cubic-bezier(0.4, 0, 0.2, 1)`
                  : "none",
              }}
            />
          </div>
        </div>
      )}

      {/* ===== PAGE CONTENT ===== */}
      <div
        className={`
          transition-all ease-out
          ${
            phase === "done" || phase === "idle"
              ? "opacity-100 translate-y-0"
              : phase === "exiting"
                ? "opacity-100 translate-y-0"
                : "opacity-0 translate-y-3"
          }
        `}
        style={{
          transitionDuration:
            phase === "exiting" || phase === "done" ? "500ms" : "300ms",
        }}
      >
        {displayChildren}
      </div>

      {/* ===== KEYFRAMES ===== */}
      <style>{`
        @keyframes timi-logo-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes timi-logo-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes timi-dot-bounce {
          0%, 100% { transform: translateY(0); opacity: 0.4; }
          50% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </>
  );
}
