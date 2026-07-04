import { api } from "./client";
import type { SessionRead, UserRead, UserUpdate } from "./types";

export function getMe(): Promise<UserRead> {
  return api.get<UserRead>("/users/me");
}

export function updateMe(data: UserUpdate): Promise<UserRead> {
  return api.patch<UserRead>("/users/me", data);
}

/** Permanently delete the account (password-confirmed server-side). */
export function deleteAccount(password: string): Promise<void> {
  return api.del<void>("/users/me", { password });
}

/** Start an email change; the backend mails a confirm link to the new address. */
export function requestEmailChange(newEmail: string, password: string): Promise<void> {
  return api.post<void>("/users/me/email", { new_email: newEmail, password });
}

export function listSessions(): Promise<SessionRead[]> {
  return api.get<SessionRead[]>("/users/me/sessions");
}

export function revokeSession(jti: string): Promise<void> {
  return api.del<void>(`/users/me/sessions/${encodeURIComponent(jti)}`);
}
