import { createPortal } from "react-dom";
import type { ReactNode, MouseEvent } from "react";
import { X } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  ariaLabel: string;
  className?: string;
  showCloseButton?: boolean;
}

/** Shared viewport-centered modal shell for all application dialogs. */
export default function Modal({
  open,
  onClose,
  children,
  ariaLabel,
  className = "max-w-lg",
  showCloseButton = false,
}: ModalProps) {
  useBodyScrollLock(open, "shared-modal");
  if (!open) return null;

  const stopPropagation = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex min-h-screen items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/45 p-4 pt-8 backdrop-blur-sm sm:pt-10"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
    >
      <div
        className={`relative my-0 w-full overflow-visible rounded-3xl border border-violet-100 bg-white p-6 shadow-2xl ${className}`}
        onMouseDown={stopPropagation}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
