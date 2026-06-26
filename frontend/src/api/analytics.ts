import { api } from "./client";
import type { ClickRead, LinkStats, Page } from "./types";

export function getLinkStats(
  id: string,
  bucket: "day" | "hour" = "day",
): Promise<LinkStats> {
  return api.get<LinkStats>(`/links/${id}/stats`, { bucket });
}

export function listClicks(
  id: string,
  params: { limit?: number; offset?: number } = {},
): Promise<Page<ClickRead>> {
  return api.get<Page<ClickRead>>(`/links/${id}/clicks`, {
    limit: params.limit,
    offset: params.offset,
  });
}
