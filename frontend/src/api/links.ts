import { api } from "./client";
import type { LinkCreate, LinkRead, LinkUpdate, Page } from "./types";

export function createLink(data: LinkCreate): Promise<LinkRead> {
  return api.post<LinkRead>("/links", data);
}

export function listLinks(params: { limit?: number; offset?: number } = {}): Promise<
  Page<LinkRead>
> {
  return api.get<Page<LinkRead>>("/links", {
    limit: params.limit,
    offset: params.offset,
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
