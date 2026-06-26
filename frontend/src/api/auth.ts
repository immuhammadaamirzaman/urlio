import { api } from "./client";
import { tokenStore } from "./tokenStore";
import type { TokenPair, UserCreate, UserLogin, UserRead } from "./types";

export function register(data: UserCreate): Promise<UserRead> {
  return api.post<UserRead>("/auth/register", data, { auth: false });
}

export function login(data: UserLogin): Promise<TokenPair> {
  return api.post<TokenPair>("/auth/login", data, { auth: false });
}

/** Revoke the current refresh token server-side, then clear local tokens. */
export async function logout(): Promise<void> {
  const refresh = tokenStore.getRefresh();
  if (refresh) {
    try {
      await api.post<void>("/auth/logout", { refresh_token: refresh });
    } catch {
      // Logout is best-effort; clear locally regardless.
    }
  }
  tokenStore.clear();
}

export async function logoutAll(): Promise<void> {
  try {
    await api.post<void>("/auth/logout-all");
  } finally {
    tokenStore.clear();
  }
}
