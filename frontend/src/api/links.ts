import { api } from "./client";
import type { LinkCreate, LinkRead, LinkUpdate, Page } from "./types";

export function createLink(data: LinkCreate): Promise<LinkRead> {
  return api.post<LinkRead>("/links", data);
}

export type LinkSort = "created_at" | "click_count" | "last_clicked_at";

export interface ListLinksParams {
  limit?: number;
  offset?: number;
  q?: string;
  sort?: LinkSort;
  order?: "asc" | "desc";
  is_active?: boolean;
}

export function listLinks(params: ListLinksParams = {}): Promise<Page<LinkRead>> {
  return api.get<Page<LinkRead>>("/links", {
    limit: params.limit,
    offset: params.offset,
    q: params.q || undefined,
    sort: params.sort,
    order: params.order,
    is_active: params.is_active,
  });
}

export function getLink(id: string): Promise<LinkRead> {
  return api.get<LinkRead>(`/links/${id}`);
}

export function updateLink(id: string, data: LinkUpdate): Promise<LinkRead> {
  return api.patch<LinkRead>(`/links/${id}`, data);
}

export function deleteLink(id: string): Promise<void> {
  return api.del<void>(`/links/${id}`);
}
