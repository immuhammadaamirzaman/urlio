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

/** Request a password-reset email. Always succeeds (no account-existence leak). */
export function forgotPassword(email: string): Promise<void> {
  return api.post<void>("/auth/forgot-password", { email }, { auth: false });
}

export function resetPassword(token: string, newPassword: string): Promise<void> {
  return api.post<void>(
    "/auth/reset-password",
    { token, new_password: newPassword },
    { auth: false },
  );
}

export function verifyEmail(token: string): Promise<void> {
  return api.post<void>("/auth/verify-email", { token }, { auth: false });
}

export function resendVerification(): Promise<void> {
  return api.post<void>("/auth/resend-verification");
}

export function confirmEmailChange(token: string): Promise<void> {
  return api.post<void>("/auth/confirm-email-change", { token }, { auth: false });
}
