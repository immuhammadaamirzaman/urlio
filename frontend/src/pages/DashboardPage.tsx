import { useEffect, useState } from "react";

import { listLinks } from "../api/links";
import type { LinkSort } from "../api/links";
import type { LinkRead, Page } from "../api/types";
import { CreateLinkForm } from "../components/CreateLinkForm";
import { EmptyState, ErrorState } from "../components/ErrorState";
import { LinkRow } from "../components/LinkRow";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { PageLoader } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";

const PAGE_SIZE = 20;
type StatusFilter = "all" | "active" | "inactive";

export function DashboardPage() {
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LinkSort>("created_at");
  const [status, setStatus] = useState<StatusFilter>("all");

  // Debounce typing into the actual search term (which triggers the fetch).
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const filtered = search !== "" || status !== "all";

  const { data, loading, error, reload, setData } = useAsyncData<Page<LinkRead>>(
    () =>
      listLinks({
        limit: PAGE_SIZE,
        offset,
        q: search,
        sort,
        is_active: status === "all" ? undefined : status === "active",
      }),
    [offset, search, sort, status],
  );

  function handleCreated() {
    setCreating(false);
    if (offset !== 0) setOffset(0);
    else reload();
  }

  function handleChanged(updated: LinkRead) {
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((l) => (l.id === updated.id ? updated : l)) }
        : prev,
    );
  }

  function handleDeleted(id: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.filter((l) => l.id !== id),
            total: prev.total !== null ? Math.max(0, prev.total - 1) : null,
          }
        : prev,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Your links</h1>
          <p className="text-sm text-slate-500">Manage, edit, and track your short links.</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary">
          + New link
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input max-w-sm"
          placeholder="Search by code or destination…"
          aria-label="Search links"
        />
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as LinkSort);
            setOffset(0);
          }}
          className="input w-auto"
          aria-label="Sort links"
        >
          <option value="created_at">Newest first</option>
          <option value="click_count">Most clicked</option>
          <option value="last_clicked_at">Recently clicked</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setOffset(0);
          }}
          className="input w-auto"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {loading && !data ? (
        <PageLoader label="Loading your links…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            title="No links match"
            subtitle="Try a different search term or filter."
          />
        ) : (
          <EmptyState
            title="No links yet"
            subtitle="Create your first short link to start tracking clicks."
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="btn-primary"
              >
                + New link
              </button>
            }
          />
        )
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((link) => (
              <LinkRow
                key={link.id}
                link={link}
                onChanged={handleChanged}
                onDeleted={handleDeleted}
              />
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            total={data.total}
            count={data.items.length}
            onChange={setOffset}
          />
        </>
      )}

      <Modal open={creating} title="Create a short link" onClose={() => setCreating(false)}>
        <CreateLinkForm onCreated={handleCreated} compact />
      </Modal>
    </div>
  );
}
