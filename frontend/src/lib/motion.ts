// Shared motion primitives. Most of the app's motion is guarded declaratively
// with Tailwind's `motion-safe:` / `motion-reduce:` variants, which need no
// JavaScript. These helpers cover the cases CSS can't express: JS-driven
// timings, and imperative DOM work outside React's render.

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

// One MediaQueryList for the whole app. `undefined` means "not resolved yet",
// `null` means "no matchMedia here" — so we only probe the environment once.
let query: MediaQueryList | null | undefined;

/** The shared `prefers-reduced-motion` list, or `null` outside the browser. */
export function reducedMotionQuery(): MediaQueryList | null {
  if (query === undefined) {
    query =
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(REDUCED_MOTION_QUERY)
        : null;
  }
  return query;
}

/**
 * Imperative check for "reduce motion". For React components prefer the
 * `usePrefersReducedMotion` hook, which re-renders when the setting changes.
 */
export function prefersReducedMotion(): boolean {
  return reducedMotionQuery()?.matches ?? false;
}
