import { useEffect, useState } from "react";

import { adminDeleteLink, adminListLinks, adminSetLinkActive } from "../../api/admin";
import type { AdminLinkRead, Page } from "../../api/types";
import { EmptyState, ErrorState } from "../../components/ErrorState";
import { Modal } from "../../components/Modal";
import { Pagination } from "../../components/Pagination";
import { PageLoader, Spinner } from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { errorMessage } from "../../lib/errors";
import { formatDate, formatNumber, prettyUrl } from "../../lib/format";

const PAGE_SIZE = 20;
type StatusFilter = "all" | "active" | "inactive";

export function AdminLinksTab() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [offset, setOffset] = useState(0);
  const [deleting, setDeleting] = useState<AdminLinkRead | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const links = useAsyncData<Page<AdminLinkRead>>(
    () =>
      adminListLinks({
        q: search,
        is_active: status === "all" ? undefined : status === "active",
        limit: PAGE_SIZE,
        offset,
      }),
    [search, status, offset],
  );

  function replaceRow(updated: AdminLinkRead) {
    links.setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((l) => (l.id === updated.id ? updated : l)) }
        : prev,
    );
  }

  async function handleToggleActive(link: AdminLinkRead) {
    setBusyId(link.id);
    try {
      const updated = await adminSetLinkActive(link.id, !link.is_active);
      replaceRow(updated);
      toast.success(updated.is_active ? "Link enabled." : "Link disabled — redirects stop immediately.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(link: AdminLinkRead) {
    setBusyId(link.id);
    try {
      await adminDeleteLink(link.id);
      links.setData((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.filter((l) => l.id !== link.id),
              total: prev.total !== null ? Math.max(0, prev.total - 1) : null,
            }
          : prev,
      );
      toast.success(`Deleted /${link.code}.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input max-w-sm"
          placeholder="Search by code or target URL…"
          aria-label="Search links"
        />
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
          <option value="inactive">Disabled</option>
        </select>
      </div>

      {links.loading && !links.data ? (
        <PageLoader label="Loading links…" />
      ) : links.error ? (
        <ErrorState message={links.error} onRetry={links.reload} />
      ) : !links.data || links.data.items.length === 0 ? (
        <EmptyState
          title="No links found"
          subtitle={search || status !== "all" ? "Try different filters." : undefined}
        />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Link</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Clicks</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {links.data.items.map((l) => (
                  <tr key={l.id} className="text-slate-700">
                    <td className="max-w-[20rem] px-4 py-3">
                      <a
                        href={l.short_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand-700 hover:underline"
                      >
                        /{l.code}
                      </a>
                      <p className="truncate text-xs text-slate-500" title={l.target_url}>
                        → {prettyUrl(l.target_url)}
                      </p>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3">
                      {l.owner_email ?? (
                        <span className="text-slate-400">anonymous</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatNumber(l.click_count)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(l.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {l.is_active ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(l)}
                          disabled={busyId === l.id}
                          className="btn-secondary text-xs"
                        >
                          {busyId === l.id ? <Spinner className="h-3 w-3" /> : null}
                          {l.is_active ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(l)}
                          disabled={busyId === l.id}
                          className="btn-danger text-xs"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            total={links.data.total}
            count={links.data.items.length}
            onChange={setOffset}
          />
        </>
      )}

      <Modal
        open={deleting !== null}
        title="Delete this link?"
        onClose={() => setDeleting(null)}
      >
        {deleting && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>/{deleting.code}</strong> → {prettyUrl(deleting.target_url)} and its
              click history will be permanently removed. The short URL stops working
              immediately.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDeleting(null)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDelete(deleting)}
                disabled={busyId === deleting.id}
                className="btn-danger"
              >
                {busyId === deleting.id ? <Spinner className="h-4 w-4" /> : null}
                Delete link
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
