import { useLayoutEffect, useRef } from "react";

/** Lock the document before paint without changing the user's current viewport position. */
export function useBodyScrollLock(locked: boolean, lockKey = "default") {
  const currentLockKey = useRef(lockKey);
  const previousLockKey = useRef(lockKey);
  currentLockKey.current = lockKey;

  useLayoutEffect(() => {
    if (!locked) return;

    const routeChanged = previousLockKey.current !== lockKey;
    previousLockKey.current = lockKey;
    if (routeChanged) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    const html = document.documentElement;
    const body = document.body;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
    };

    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = `-${scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.left = previous.bodyLeft;
      body.style.width = previous.bodyWidth;
      body.style.overflow = previous.bodyOverflow;
      if (currentLockKey.current === lockKey) {
        window.scrollTo({ top: scrollY, left: scrollX, behavior: "auto" });
      }
    };
  }, [locked, lockKey]);
}
