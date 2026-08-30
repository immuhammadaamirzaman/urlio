import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import { CloseIcon } from "./ServiceIcons";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Modal({ open, title, onClose, children }: ModalProps) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  /**
   * `aria-modal="true"` is a promise to assistive tech that the rest of the page is
   * unreachable, so the dialog has to keep focus inside itself, hand focus back to
   * whatever opened it, and stop the page behind from scrolling.
   */
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // This effect runs after React has applied any `autoFocus`, so honour that choice
    // first — otherwise we would steal focus from the field the dialog wants. Failing
    // that, take the first focusable node, or the panel itself for read-only dialogs.
    const target =
      panel.current?.querySelector<HTMLElement>("[autofocus]") ??
      panel.current?.querySelector<HTMLElement>(FOCUSABLE) ??
      panel.current;
    target?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;

      const targets = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const firstTarget = targets[0];
      const lastTarget = targets[targets.length - 1];
      if (!firstTarget || !lastTarget) return;

      // Wrap at both ends so Tab can never walk out into the page behind.
      if (!e.shiftKey && document.activeElement === lastTarget) {
        e.preventDefault();
        firstTarget.focus();
      } else if (e.shiftKey && document.activeElement === firstTarget) {
        e.preventDefault();
        lastTarget.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panel}
        className="card w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-content">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost px-2 py-1 text-content-subtle"
            aria-label="Close"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
