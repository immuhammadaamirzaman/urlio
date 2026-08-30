/** @type {import('tailwindcss').Config} */

// Colours are driven by CSS variables (see src/index.css) so the app can switch
// between light/dark and re-tint the accent at runtime. Each variable holds
// space-separated RGB channels ("59 130 246") so Tailwind's `/<alpha-value>`
// opacity modifiers keep working (e.g. `bg-brand-500/10`).
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

const brand = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((shade) => [
    shade,
    withAlpha(`--brand-${shade}`),
  ]),
);

// --- Motion tokens ---------------------------------------------------------
// Every keyframe below animates only `transform` and `opacity`. Those are the
// two properties the browser can composite off the main thread, so none of this
// triggers layout or paint and it stays smooth on low-end devices.
//
// Pair these with Tailwind's `motion-safe:` variant so users who ask for
// reduced motion simply get the resting state.
const EASE = {
  // Overshoots the target, then settles back. This is the "bouncy" one.
  spring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  // Gentler overshoot, for elements travelling further.
  "spring-soft": "cubic-bezier(0.4, 1.35, 0.5, 1)",
  // Fast start, long tail, no overshoot. Safe for edge-anchored panels where an
  // overshoot would expose a gap between the panel and the viewport edge.
  swift: "cubic-bezier(0.16, 1, 0.3, 1)",
  // Accelerating, for exits that should get out of the way.
  exit: "cubic-bezier(0.4, 0, 1, 1)",
};

const KEYFRAMES = {
  // Sidebar rows: drift in from the left, overshoot a hair, settle.
  "nav-row-in": {
    "0%": { opacity: "0", transform: "translate3d(-14px, 0, 0) scale(0.96)" },
    "60%": { opacity: "1", transform: "translate3d(2px, 0, 0) scale(1.015)" },
    "100%": { opacity: "1", transform: "translate3d(0, 0, 0) scale(1)" },
  },
  // Section headings: quieter than the rows so they don't compete.
  "label-in": {
    "0%": { opacity: "0", transform: "translate3d(-8px, 0, 0)" },
    "100%": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  },
  // Mobile drawer panel. No overshoot on purpose (see EASE.swift).
  "drawer-in": {
    "0%": { opacity: "0", transform: "translate3d(-100%, 0, 0)" },
    "100%": { opacity: "1", transform: "translate3d(0, 0, 0)" },
  },
  "drawer-out": {
    "0%": { opacity: "1", transform: "translate3d(0, 0, 0)" },
    "100%": { opacity: "0", transform: "translate3d(-100%, 0, 0)" },
  },
  "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
  "fade-out": { "0%": { opacity: "1" }, "100%": { opacity: "0" } },
  // Small elements arriving with a bit of personality.
  "pop-in": {
    "0%": { opacity: "0", transform: "scale(0.6)" },
    "55%": { opacity: "1", transform: "scale(1.12)" },
    "100%": { opacity: "1", transform: "scale(1)" },
  },
  // The active-route indicator bar, springing open from its centre.
  "rail-in": {
    "0%": { opacity: "0", transform: "scaleY(0)" },
    "55%": { opacity: "1", transform: "scaleY(1.35)" },
    "100%": { opacity: "1", transform: "scaleY(1)" },
  },
  // Locked (sign-in required) rows: the padlock gives a little shake.
  wiggle: {
    "0%, 100%": { transform: "rotate(0deg)" },
    "25%": { transform: "rotate(-10deg)" },
    "50%": { transform: "rotate(7deg)" },
    "75%": { transform: "rotate(-4deg)" },
  },
};

// `backwards` fill on entrances: the "from" frame holds during the stagger delay
// and the element reverts to its plain, untransformed style once done (so we
// don't leave a permanent transform / containing block behind).
// `forwards` on exits: the last frame must stick until React unmounts the node.
const ANIMATION = {
  "nav-row-in": `nav-row-in 420ms ${EASE.spring} backwards`,
  "label-in": `label-in 320ms ${EASE.swift} backwards`,
  "drawer-in": `drawer-in 380ms ${EASE.swift} backwards`,
  "drawer-out": `drawer-out 200ms ${EASE.exit} forwards`,
  "fade-in": "fade-in 240ms ease-out backwards",
  "fade-out": "fade-out 200ms ease-in forwards",
  "pop-in": `pop-in 360ms ${EASE.spring} backwards`,
  "rail-in": `rail-in 420ms ${EASE.spring} backwards`,
  wiggle: "wiggle 520ms ease-in-out",
};

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand,
        // Semantic, theme-aware tokens.
        canvas: withAlpha("--canvas"), // page background
        surface: withAlpha("--surface"), // cards, navbar, panels
        "surface-muted": withAlpha("--surface-muted"), // subtle fills / hovers
        content: withAlpha("--content"), // primary text
        "content-muted": withAlpha("--content-muted"), // secondary text
        "content-subtle": withAlpha("--content-subtle"), // faint text / placeholders
        border: withAlpha("--border"), // borders & dividers
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      transitionTimingFunction: EASE,
      keyframes: KEYFRAMES,
      animation: ANIMATION,
    },
  },
  plugins: [],
};
