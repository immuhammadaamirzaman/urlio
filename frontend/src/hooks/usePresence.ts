import { useEffect, useRef, useState } from "react";

/**
 * `open`    — visible and interactive.
 * `closing` — still in the DOM, playing its exit animation.
 * `closed`  — unmounted; nothing rendered.
 */
export type PresenceState = "open" | "closing" | "closed";

export interface Presence {
  /** Render the element while this is true. */
  mounted: boolean;
  state: PresenceState;
}

/**
 * Keeps a conditionally-rendered element in the DOM long enough to play an exit
 * animation. `{open && <Panel />}` tears the node out on the same frame the flag
 * flips, so the panel can only ever animate *in* — this bridges that gap.
 *
 * @param open           Whether the element should be shown.
 * @param exitDurationMs How long the exit animation runs. Pass `0` to unmount
 *                       immediately (e.g. when the user prefers reduced motion).
 */
export function usePresence(open: boolean, exitDurationMs: number): Presence {
  const [state, setState] = useState<PresenceState>(open ? "open" : "closed");
  // Without this, the very first render would schedule an exit animation for a
  // panel the user never saw.
  const hasOpened = useRef(open);

  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      setState("open");
      return;
    }
    if (!hasOpened.current || exitDurationMs <= 0) {
      setState("closed");
      return;
    }
    setState("closing");
    const timer = window.setTimeout(() => setState("closed"), exitDurationMs);
    return () => window.clearTimeout(timer);
  }, [open, exitDurationMs]);

  return { mounted: state !== "closed", state };
}
