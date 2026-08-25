import { cloneElement, isValidElement } from "react";
import type { ReactElement, ReactNode } from "react";

interface TooltipProps {
  /** Short description of what the wrapped control does. */
  label: string;
  /** A single interactive element (button/link) to attach the tooltip to. */
  children: ReactNode;
  className?: string;
}

/**
 * Lightweight hover/focus tooltip for icon or nav buttons. Pure CSS (Tailwind's
 * `group` variants), so it needs no JS state or extra dependency. Also sets a
 * native `title` on the wrapped element as a fallback for touch devices and
 * assistive tech that don't respond to `:hover`/`:focus-within`.
 */
export function Tooltip({ label, children, className = "" }: TooltipProps) {
  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ title?: string }>, { title: label })
    : children;

  return (
    <span className={`group relative inline-flex ${className}`}>
      {trigger}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 scale-95 whitespace-nowrap rounded-md bg-content px-2 py-1 text-xs font-medium text-canvas opacity-0 shadow-md transition duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
