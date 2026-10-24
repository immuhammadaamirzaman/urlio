import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";

interface TooltipProps {
  /** Short description of what the wrapped control does. */
  label: string;
  /** A single interactive element (button/link) to attach the tooltip to. */
  children: ReactNode;
  className?: string;
  /** Where the bubble sits relative to the trigger. */
  placement?: "bottom" | "bottom-end" | "right";
}

/*
 * The bubble is `absolute` and `whitespace-nowrap`, so it can be wider than its
 * trigger and sticks out in whichever direction the placement sends it. Nothing
 * clips it, which is the point — but it also means a bubble that reaches past
 * the right edge of the viewport widens the document and the page grows a
 * horizontal scrollbar. That happens whether or not the tooltip is showing:
 * resting state is `opacity-0`, not `display: none`, so it occupies layout the
 * whole time.
 *
 * Hence `bottom-end` for triggers that sit against the right edge of the page.
 * It lines the bubble's right edge up with the trigger's instead of centring
 * it, so the bubble can only grow inward.
 */
const PLACEMENT: Record<NonNullable<TooltipProps["placement"]>, string> = {
  bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
  "bottom-end": "right-0 top-full mt-2 origin-top-right",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

/**
 * Lightweight hover/focus tooltip for icon or nav buttons. Pure CSS (Tailwind's
 * `group` variants), so it needs no JS state or extra dependency.
 *
 * The trigger is linked to the bubble with `aria-describedby` rather than a
 * native `title`: `title` would make the browser paint its own tooltip on top
 * of this one, so every control ended up showing the same text twice.
 *
 * Visibility keys off `:focus-visible` rather than `:focus-within`. Clicking a
 * link or button focuses it, and `:focus-within` would keep the bubble open
 * long after the pointer left; `:focus-visible` only matches keyboard focus, so
 * mouse users see the tooltip for exactly as long as they hover.
 */
export function Tooltip({
  label,
  children,
  className = "",
  placement = "bottom",
}: TooltipProps) {
  const bubbleId = useId();

  const trigger = isValidElement(children)
    ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, {
        "aria-describedby": bubbleId,
      })
    : children;

  return (
    <span className={`group relative inline-flex ${className}`}>
      {trigger}
      <span
        id={bubbleId}
        role="tooltip"
        className={`pointer-events-none absolute z-50 scale-95 whitespace-nowrap rounded-md bg-content px-2 py-1 text-xs font-medium text-canvas opacity-0 shadow-md transition duration-150 group-hover:scale-100 group-hover:opacity-100 group-has-[:focus-visible]:scale-100 group-has-[:focus-visible]:opacity-100 ${PLACEMENT[placement]}`}
      >
        {label}
      </span>
    </span>
  );
}
