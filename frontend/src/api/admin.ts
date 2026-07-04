import { api } from "./client";
import type {
  AdminLinkRead,
  AdminStats,
  AdminUserRead,
  AdminUserUpdate,
  AuditRead,
  Page,
} from "./types";

export function adminListUsers(params: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<Page<AdminUserRead>> {
  return api.get<Page<AdminUserRead>>("/admin/users", {
    q: params.q || undefined,
    limit: params.limit,
    offset: params.offset,
  });
}

export function adminUpdateUser(
  id: string,
  data: AdminUserUpdate,
): Promise<AdminUserRead> {
  return api.patch<AdminUserRead>(`/admin/users/${id}`, data);
}

export function adminListLinks(params: {
  q?: string;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}): Promise<Page<AdminLinkRead>> {
  return api.get<Page<AdminLinkRead>>("/admin/links", {
    q: params.q || undefined,
    is_active: params.is_active,
    limit: params.limit,
    offset: params.offset,
  });
}

export function adminSetLinkActive(id: string, isActive: boolean): Promise<AdminLinkRead> {
  return api.patch<AdminLinkRead>(`/admin/links/${id}`, { is_active: isActive });
}

export function adminDeleteLink(id: string): Promise<void> {
  return api.del<void>(`/admin/links/${id}`);
}

export function adminStats(): Promise<AdminStats> {
  return api.get<AdminStats>("/admin/stats");
}

export function adminAuditLog(params: {
  limit?: number;
  offset?: number;
}): Promise<Page<AuditRead>> {
  return api.get<Page<AuditRead>>("/admin/audit", {
    limit: params.limit,
    offset: params.offset,
  });
}
