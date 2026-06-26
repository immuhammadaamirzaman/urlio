// Token storage shared between the API client (which reads/refreshes tokens) and the
// AuthContext (which reacts to login/logout). Tokens live in localStorage so a refresh
// survives a page reload; subscribers are notified on every change.

import type { TokenPair } from "./types";

const ACCESS_KEY = "shortlyx.access_token";
const REFRESH_KEY = "shortlyx.refresh_token";

type Listener = () => void;
const listeners = new Set<Listener>();

let accessToken: string | null = localStorage.getItem(ACCESS_KEY);
let refreshToken: string | null = localStorage.getItem(REFRESH_KEY);

function notify(): void {
  for (const l of listeners) l();
}

export const tokenStore = {
  getAccess(): string | null {
    return accessToken;
  },
  getRefresh(): string | null {
    return refreshToken;
  },
  hasSession(): boolean {
    return Boolean(refreshToken);
  },
  set(pair: TokenPair): void {
    accessToken = pair.access_token;
    refreshToken = pair.refresh_token;
    localStorage.setItem(ACCESS_KEY, pair.access_token);
    localStorage.setItem(REFRESH_KEY, pair.refresh_token);
    notify();
  },
  /** Update only the access token (used after a refresh that doesn't rotate state externally). */
  setAccess(token: string): void {
    accessToken = token;
    localStorage.setItem(ACCESS_KEY, token);
  },
  clear(): void {
    accessToken = null;
    refreshToken = null;
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    notify();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
