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

// Cross-tab synchronization: the storage event only fires in *other* tabs, so when tab A
// rotates the refresh token (or logs out), tab B re-reads the new values here instead of
// refreshing with a stale, already-rotated token. Because the event never fires in the
// tab that wrote, this cannot loop with set()/clear() above.
let storageListenerRegistered = false;

function syncFromStorage(e: StorageEvent): void {
  // A null key means localStorage.clear(); otherwise only react to our own keys.
  if (e.key !== null && e.key !== ACCESS_KEY && e.key !== REFRESH_KEY) return;
  const nextAccess = localStorage.getItem(ACCESS_KEY);
  const nextRefresh = localStorage.getItem(REFRESH_KEY);
  // Skip notify() when nothing actually changed to avoid spurious re-renders.
  if (nextAccess === accessToken && nextRefresh === refreshToken) return;
  accessToken = nextAccess;
  refreshToken = nextRefresh;
  notify();
}

if (!storageListenerRegistered) {
  storageListenerRegistered = true;
  window.addEventListener("storage", syncFromStorage);
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
