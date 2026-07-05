import { useTheme } from "../context/ThemeContext";
import { ACCENT_PRESETS, accentSwatch, isCustomAccent } from "../lib/theme";
import type { ThemeMode } from "../lib/theme";

const RAINBOW =
  "conic-gradient(from 90deg, #ef4444, #f59e0b, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ef4444)";

function ModeIcon({ mode }: { mode: ThemeMode }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-4 w-4",
    "aria-hidden": true,
  };
  if (mode === "light") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    );
  }
  if (mode === "dark") {
    return (
      <svg {...common}>
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

const MODES: { key: ThemeMode; label: string }[] = [
  { key: "light", label: "Light" },
  { key: "system", label: "System" },
  { key: "dark", label: "Dark" },
];

export function AppearanceSettings() {
  const { mode, accent, setMode, setAccent } = useTheme();
  const custom = isCustomAccent(accent);
  const selectedLabel = custom
    ? accentSwatch(accent)
    : (ACCENT_PRESETS.find((p) => p.key === accent)?.label ?? accent);

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-content">Appearance</h2>
      <p className="mt-1 text-sm text-content-muted">
        Choose a theme and accent colour. Your choice is saved to your account.
      </p>

      {/* Theme mode */}
      <div className="mt-5">
        <span className="label">Theme</span>
        <div
          role="radiogroup"
          aria-label="Theme mode"
          className="inline-flex rounded-lg border border-border bg-surface-muted p-1"
        >
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(m.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-surface text-content shadow-sm"
                    : "text-content-muted hover:text-content"
                }`}
              >
                <ModeIcon mode={m.key} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Accent colour */}
      <div className="mt-5">
        <span className="label">Accent colour</span>
        <div className="flex flex-wrap items-center gap-2.5">
          {ACCENT_PRESETS.map((p) => {
            const selected = accent === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setAccent(p.key)}
                aria-label={p.label}
                aria-pressed={selected}
                title={p.label}
                style={{ backgroundColor: p.swatch }}
                className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-surface transition-transform ${
                  selected ? "ring-2 ring-content" : "hover:scale-110"
                }`}
              />
            );
          })}

          {/* Custom colour */}
          <label
            title="Custom colour"
            style={{ background: custom ? accentSwatch(accent) : RAINBOW }}
            className={`relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110 ${
              custom ? "ring-2 ring-content" : ""
            }`}
          >
            <input
              type="color"
              value={accentSwatch(accent)}
              onChange={(e) => setAccent(e.target.value)}
              aria-label="Custom accent colour"
              className="absolute inset-0 h-full w-full cursor-pointer rounded-full opacity-0"
            />
            {!custom && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                className="h-4 w-4 drop-shadow"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </label>

          <span className="ml-1 text-sm text-content-muted">{selectedLabel}</span>
        </div>
      </div>

      {/* Live preview */}
      <div className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-canvas p-4">
        <button type="button" className="btn-primary text-sm" tabIndex={-1}>
          Primary
        </button>
        <button type="button" className="btn-secondary text-sm" tabIndex={-1}>
          Secondary
        </button>
        <span className="rounded-full bg-brand-500/15 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:text-brand-300">
          Badge
        </span>
        <a className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
          Link
        </a>
      </div>
    </section>
  );
}
