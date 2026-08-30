import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { updateMe } from "../api/users";
import {
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  accentToBrandVars,
  applyBrandVars,
  applyResolvedMode,
  isThemeMode,
  loadStoredTheme,
  resolveMode,
  saveStoredTheme,
  withThemeTransition,
} from "../lib/theme";
import type { ResolvedMode, ThemeMode } from "../lib/theme";
import { useAuth } from "./AuthContext";

interface ThemeContextValue {
  mode: ThemeMode;
  accent: string;
  resolvedMode: ResolvedMode;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: string) => void;
  /** Flip between light and dark (used by the navbar button). */
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, setUser } = useAuth();

  // One read of localStorage, shared by both initializers.
  const [initial] = useState(loadStoredTheme);
  const [mode, setModeState] = useState<ThemeMode>(initial.mode);
  const [accent, setAccentState] = useState<string>(initial.accent);
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>(() => resolveMode(mode));

  // Keep the latest values in refs so the debounced sync always sees "both" fields.
  // Written from an effect rather than during render: `setMode`/`setAccent` only ever
  // run from event handlers, which is after the previous commit's effects have flushed,
  // so the refs are always current by the time they are read.
  const modeRef = useRef(mode);
  const accentRef = useRef(accent);
  useEffect(() => {
    modeRef.current = mode;
    accentRef.current = accent;
  }, [mode, accent]);

  // Tracks the last mode we painted, so we can tell a real light/dark flip from
  // the first apply on mount or a change that only touched the accent.
  const paintedModeRef = useRef<ResolvedMode | null>(null);

  // Apply to the DOM + persist locally whenever mode or accent changes. The boot
  // script in index.html applies the same thing before paint, so this is idempotent.
  useEffect(() => {
    const resolved = resolveMode(mode);
    // Only cross-fade an actual light<->dark flip. Skipping the first apply keeps
    // page load instant, and skipping accent-only changes keeps the colour picker
    // tracking the drag instead of lagging a fade behind it.
    const flipped = paintedModeRef.current !== null && paintedModeRef.current !== resolved;
    paintedModeRef.current = resolved;

    // Derived once and shared: the DOM needs these now and the cache below stores the
    // same values. Recomputing would mean building the 10-shade scale twice on every
    // change event the colour picker emits while being dragged.
    const brandVars = accentToBrandVars(accent);

    const apply = () => {
      applyResolvedMode(resolved);
      applyBrandVars(brandVars);
    };
    if (flipped) withThemeTransition(apply);
    else apply();

    setResolvedMode(resolved);
    saveStoredTheme(mode, accent, brandVars);
  }, [mode, accent]);

  // Follow the OS preference live while in "system" mode.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved: ResolvedMode = mq.matches ? "dark" : "light";
      paintedModeRef.current = resolved;
      setResolvedMode(resolved);
      // The OS flipping under us is still a light<->dark switch, so fade it too.
      withThemeTransition(() => applyResolvedMode(resolved));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  // On sign-in (or when a different account loads), adopt the account's saved
  // preferences as the source of truth. Guarded by user id so our own writes
  // (which call setUser with the same id) don't re-trigger this.
  const syncedUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) {
      // Signing out: if an account's theme was previously adopted, fall back to
      // the app defaults rather than leaving that account's theme applied for
      // whoever uses this browser next (or if the same user logs back in fresh).
      if (syncedUserRef.current !== null) {
        setModeState(DEFAULT_MODE);
        setAccentState(DEFAULT_ACCENT);
      }
      syncedUserRef.current = null;
      return;
    }
    if (syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;
    // Still validated at runtime: `theme` is typed from the schema, not verified.
    setModeState(isThemeMode(user.theme) ? user.theme : DEFAULT_MODE);
    setAccentState(user.accent || DEFAULT_ACCENT);
  }, [user]);

  // Debounced push to the account. Coalesces rapid changes (e.g. dragging the
  // colour picker) into a single PATCH.
  const syncTimer = useRef<number | null>(null);
  const syncToServer = useCallback(
    (nextMode: ThemeMode, nextAccent: string) => {
      if (!isAuthenticated) return;
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
      syncTimer.current = window.setTimeout(() => {
        updateMe({ theme: nextMode, accent: nextAccent })
          .then((updated) => setUser(updated))
          .catch(() => {
            // Keep the local choice; it will re-sync from the server on next load.
          });
      }, 400);
    },
    [isAuthenticated, setUser],
  );

  useEffect(() => {
    return () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    };
  }, []);

  const setMode = useCallback(
    (next: ThemeMode) => {
      setModeState(next);
      syncToServer(next, accentRef.current);
    },
    [syncToServer],
  );

  const setAccent = useCallback(
    (next: string) => {
      setAccentState(next);
      syncToServer(modeRef.current, next);
    },
    [syncToServer],
  );

  const toggleMode = useCallback(() => {
    setMode(resolvedMode === "dark" ? "light" : "dark");
  }, [resolvedMode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, accent, resolvedMode, setMode, setAccent, toggleMode }),
    [mode, accent, resolvedMode, setMode, setAccent, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
