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
    },
  },
  plugins: [],
};
