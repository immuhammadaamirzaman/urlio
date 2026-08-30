import { useSyncExternalStore } from "react";

import { prefersReducedMotion, reducedMotionQuery } from "../lib/motion";

function subscribe(onStoreChange: () => void): () => void {
  const mql = reducedMotionQuery();
  if (!mql) return () => {};
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

/** Assume motion is fine when there's no `window` to ask. */
function getServerSnapshot(): boolean {
  return false;
}

/**
 * True when the OS is set to "reduce motion", re-rendering if the user changes
 * it mid-session.
 *
 * Most of our motion is guarded with Tailwind's `motion-safe:` / `motion-reduce:`
 * variants, which need no JavaScript. Reach for this hook only where CSS can't
 * help — JS timings (how long to keep an exiting element mounted) and inline
 * stagger delays.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, getServerSnapshot);
}
