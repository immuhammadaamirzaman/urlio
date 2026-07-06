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
  loadStoredTheme,
  resolveMode,
  saveStoredTheme,
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

const stored = () => loadStoredTheme();

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, setUser } = useAuth();

  const [mode, setModeState] = useState<ThemeMode>(() => stored()?.mode ?? DEFAULT_MODE);
  const [accent, setAccentState] = useState<string>(() => stored()?.accent ?? DEFAULT_ACCENT);
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>(() => resolveMode(mode));

  // Keep the latest values in refs so the debounced sync always sees "both" fields.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const accentRef = useRef(accent);
  accentRef.current = accent;

  // Apply to the DOM + persist locally whenever mode or accent changes. The boot
  // script in index.html applies the same thing before paint, so this is idempotent.
  useEffect(() => {
    const resolved = resolveMode(mode);
    setResolvedMode(resolved);
    applyResolvedMode(resolved);
    applyBrandVars(accentToBrandVars(accent));
    saveStoredTheme(mode, accent);
  }, [mode, accent]);

  // Follow the OS preference live while in "system" mode.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved: ResolvedMode = mq.matches ? "dark" : "light";
      setResolvedMode(resolved);
      applyResolvedMode(resolved);
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
      syncedUserRef.current = null;
      return;
    }
    if (syncedUserRef.current === user.id) return;
    syncedUserRef.current = user.id;
    const serverMode: ThemeMode =
      user.theme === "light" || user.theme === "dark" || user.theme === "system"
        ? user.theme
        : DEFAULT_MODE;
    setModeState(serverMode);
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
