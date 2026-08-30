import { useTheme } from "../context/ThemeContext";
import { Tooltip } from "./Tooltip";

interface IconProps {
  className?: string;
}

function SunIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/*
 * Both icons stay mounted and cross-rotate past each other; the outgoing one
 * spins away clockwise as the incoming one arrives counter-clockwise. Swapping
 * `{isDark ? <Sun/> : <Moon/>}` would remount the node, and a fresh node has no
 * previous style to transition from — so the swap would just pop.
 *
 * `ease-spring` overshoots, which is what sells it as a switch rather than a fade.
 * Under reduced motion the state classes still apply, they just land instantly.
 */
const FACE =
  "absolute inset-0 grid place-items-center transition-[transform,opacity] duration-500 ease-spring motion-reduce:transition-none";
const FACE_IN = "rotate-0 scale-100 opacity-100";
const FACE_OUT_CW = "rotate-90 scale-50 opacity-0";
const FACE_OUT_CCW = "-rotate-90 scale-50 opacity-0";

/** Compact light/dark switch for the navbar (works signed-out too). */
export function ThemeToggle() {
  const { resolvedMode, toggleMode } = useTheme();
  const isDark = resolvedMode === "dark";

  // `role="switch"` + `aria-checked` announces the current state, so the
  // accessible name is the thing being toggled ("Dark theme") rather than the
  // action. The action wording lives in the tooltip. No `title` attribute — the
  // browser would paint its own bubble on top of the tooltip.
  //
  // The button is Tooltip's only child on purpose: Tooltip clones it to attach
  // `aria-describedby`, and that needs a single element child.
  return (
    <Tooltip label={isDark ? "Switch to the light theme" : "Switch to the dark theme"}>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label="Dark theme"
        onClick={toggleMode}
        className="relative grid h-9 w-9 place-items-center rounded-lg text-content-muted transition duration-300 ease-spring hover:bg-surface-muted hover:text-content motion-safe:hover:scale-105 motion-safe:active:scale-90"
      >
        {/* Accent bloom behind the icons, so entering dark mode feels like
            something switched on rather than just recoloured. */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 rounded-lg bg-brand-500/15 transition-[transform,opacity] duration-500 ease-spring motion-reduce:transition-none ${
            isDark ? "scale-100 opacity-100" : "scale-50 opacity-0"
          }`}
        />
        <span className={`${FACE} ${isDark ? FACE_IN : FACE_OUT_CCW}`}>
          <SunIcon />
        </span>
        <span className={`${FACE} ${isDark ? FACE_OUT_CW : FACE_IN}`}>
          <MoonIcon />
        </span>
      </button>
    </Tooltip>
  );
}
