import { api } from "./client";
import type { UserRead, UserUpdate } from "./types";

export function getMe(): Promise<UserRead> {
  return api.get<UserRead>("/users/me");
}

export function updateMe(data: UserUpdate): Promise<UserRead> {
  return api.patch<UserRead>("/users/me", data);
}
