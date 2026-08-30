import { useRef } from "react";
import type { ComponentType, KeyboardEvent } from "react";

import { useTheme } from "../context/ThemeContext";
import { ACCENT_PRESETS, accentSwatch, isCustomAccent } from "../lib/theme";
import type { ThemeMode } from "../lib/theme";
import type { IconProps } from "./ServiceIcons";
import { MonitorIcon, MoonIcon, SunIcon } from "./ServiceIcons";

const RAINBOW =
  "conic-gradient(from 90deg, #ef4444, #f59e0b, #10b981, #06b6d4, #3b82f6, #8b5cf6, #ef4444)";

const MODES: { key: ThemeMode; label: string; Icon: ComponentType<IconProps> }[] = [
  { key: "light", label: "Light", Icon: SunIcon },
  { key: "system", label: "System", Icon: MonitorIcon },
  { key: "dark", label: "Dark", Icon: MoonIcon },
];

export function AppearanceSettings() {
  const { mode, accent, setMode, setAccent } = useTheme();
  const custom = isCustomAccent(accent);
  const selectedLabel = custom
    ? accentSwatch(accent)
    : (ACCENT_PRESETS.find((p) => p.key === accent)?.label ?? accent);

  const modeButtons = useRef<(HTMLButtonElement | null)[]>([]);

  /**
   * A `radiogroup` is a single tab stop: Tab moves past it, arrows move within it. Only
   * the checked radio is tabbable (roving tabindex), and moving the focus also selects,
   * which is the expected behaviour for a group whose options apply immediately.
   */
  function handleModeKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = (index + delta + MODES.length) % MODES.length;
    const target = MODES[next];
    if (!target) return;
    setMode(target.key);
    modeButtons.current[next]?.focus();
  }

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
          {MODES.map((m, index) => {
            const active = mode === m.key;
            return (
              <button
                key={m.key}
                ref={(el) => {
                  modeButtons.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setMode(m.key)}
                onKeyDown={(e) => handleModeKeyDown(e, index)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-surface text-content shadow-sm"
                    : "text-content-muted hover:text-content"
                }`}
              >
                <m.Icon className="h-4 w-4" />
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
        {/* A swatch, not a destination — an <a> with no href is not a link, so this
            stays a span and only borrows the link styling. */}
        <span className="text-sm font-medium text-brand-600 underline dark:text-brand-400">
          Link
        </span>
      </div>
    </section>
  );
}
