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

import * as authApi from "../api/auth";
import { tokenStore } from "../api/tokenStore";
import { getMe } from "../api/users";
import type { TokenPair, UserLogin, UserRead } from "../api/types";
import { setGuestMode } from "../lib/guestMode";
import { clearGuestSandbox } from "../lib/guestSandbox";

interface AuthContextValue {
  user: UserRead | null;
  isAuthenticated: boolean;
  /** Signed in to the shared demo account: everything is visible, nothing is saved. */
  isGuest: boolean;
  initializing: boolean;
  login: (credentials: UserLogin) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  setSession: (pair: TokenPair) => Promise<void>;
  setUser: (user: UserRead) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRead | null>(null);
  const [initializing, setInitializing] = useState(true);

  // On mount, if we have a stored session, hydrate the current user.
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!tokenStore.hasSession()) {
        setInitializing(false);
        return;
      }
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch {
        // Refresh failed or session invalid — client already cleared tokens.
        if (!cancelled) tokenStore.clear();
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  // If tokens are cleared elsewhere (e.g. a failed refresh), drop the user.
  useEffect(() => {
    return tokenStore.subscribe(() => {
      if (!tokenStore.hasSession()) setUser(null);
    });
  }, []);

  // Mirror guest status into the API client, which isn't a component and so can't read
  // this context. An effect is enough: writes originate from event handlers, which can
  // only run after the commit that this effect belongs to has flushed.
  const isGuest = user?.is_guest ?? false;
  const wasGuest = useRef(false);
  useEffect(() => {
    setGuestMode(isGuest);
    // Leaving the preview takes its contents with it. Skipped while a stored session is
    // still hydrating, when `user` is briefly null and would otherwise look like a
    // sign-out: reloading mid-preview has to keep what you were just looking at.
    if (initializing) return;
    if (wasGuest.current && !isGuest) clearGuestSandbox();
    wasGuest.current = isGuest;
  }, [isGuest, initializing]);

  const setSession = useCallback(async (pair: TokenPair) => {
    tokenStore.set(pair);
    const me = await getMe();
    setUser(me);
  }, []);

  const login = useCallback(
    async (credentials: UserLogin) => {
      // Any sign-in starts from a clean preview, so one visitor's leftovers never greet
      // the next person to open the demo on this browser.
      clearGuestSandbox();
      const pair = await authApi.login(credentials);
      await setSession(pair);
    },
    [setSession],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    setUser(null);
  }, []);

  const logoutAll = useCallback(async () => {
    await authApi.logoutAll();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isGuest,
      initializing,
      login,
      logout,
      logoutAll,
      setSession,
      setUser,
    }),
    [user, isGuest, initializing, login, logout, logoutAll, setSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
