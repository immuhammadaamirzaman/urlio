import { cloneElement, isValidElement, useId } from "react";
import type { ReactElement, ReactNode } from "react";

interface TooltipProps {
  label: string;
  children: ReactNode;
  className?: string;
  placement?: "bottom" | "bottom-end" | "right";
}

const PLACEMENT: Record<NonNullable<TooltipProps["placement"]>, string> = {
  bottom: "left-1/2 top-full mt-2 -translate-x-1/2",
  "bottom-end": "right-0 top-full mt-2 origin-top-right",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};


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
