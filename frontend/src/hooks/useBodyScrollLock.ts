import { useLayoutEffect } from "react";

type ScrollSnapshot = {
  scrollX: number;
  scrollY: number;
  htmlOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyWidth: string;
  bodyOverflow: string;
};

// Scroll locking is global because every modal is rendered in a portal. A
// counter prevents one modal from undoing the lock while another modal is
// still open (for example, a risk dialog followed by its PIN dialog).
let activeLocks = 0;
let snapshot: ScrollSnapshot | null = null;

function acquireScrollLock() {
  if (activeLocks === 0) {
    const html = document.documentElement;
    const body = document.body;

    snapshot = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      htmlOverflow: html.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyWidth: body.style.width,
      bodyOverflow: body.style.overflow,
    };

    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${snapshot.scrollY}px`;
    body.style.left = `-${snapshot.scrollX}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
  }

  activeLocks += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    activeLocks = Math.max(0, activeLocks - 1);

    // Keep the page locked until every modal/overlay has released its lock.
    if (activeLocks > 0 || !snapshot) return;

    const html = document.documentElement;
    const body = document.body;
    const previous = snapshot;
    snapshot = null;

    html.style.overflow = previous.htmlOverflow;
    body.style.position = previous.bodyPosition;
    body.style.top = previous.bodyTop;
    body.style.left = previous.bodyLeft;
    body.style.width = previous.bodyWidth;
    body.style.overflow = previous.bodyOverflow;
    window.scrollTo({ top: previous.scrollY, left: previous.scrollX, behavior: "auto" });
  };
}

/** Lock document scrolling while a modal is open without losing the viewport position. */
export function useBodyScrollLock(locked: boolean, _lockKey = "default") {
  // Keep the second argument for existing callers; route changes are handled
  // by the router rather than by resetting the scroll position here.
  void _lockKey;
  useLayoutEffect(() => {
    if (!locked) return undefined;
    return acquireScrollLock();
  }, [locked]);
}
