import { useEffect, useState } from "react";

import { adminListUsers, adminUpdateUser } from "../../api/admin";
import type { AdminUserRead, Page } from "../../api/types";
import { EmptyState, ErrorState } from "../../components/ErrorState";
import { Modal } from "../../components/Modal";
import { Pagination } from "../../components/Pagination";
import { PageLoader, Spinner } from "../../components/Spinner";
import { useToast } from "../../context/ToastContext";
import { useAsyncData } from "../../hooks/useAsyncData";
import { errorMessage } from "../../lib/errors";
import { formatDate, formatNumber } from "../../lib/format";

const PAGE_SIZE = 20;

export function AdminUsersTab() {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [deactivating, setDeactivating] = useState<AdminUserRead | null>(null);
  const [disableLinks, setDisableLinks] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const users = useAsyncData<Page<AdminUserRead>>(
    () => adminListUsers({ q: search, limit: PAGE_SIZE, offset }),
    [search, offset],
  );

  function replaceRow(updated: AdminUserRead) {
    users.setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((u) => (u.id === updated.id ? updated : u)) }
        : prev,
    );
  }

  async function handleSetActive(user: AdminUserRead, isActive: boolean, alsoLinks = false) {
    setBusyId(user.id);
    try {
      const updated = await adminUpdateUser(user.id, {
        is_active: isActive,
        disable_links: alsoLinks,
      });
      replaceRow(updated);
      toast.success(
        isActive ? `${user.email} reactivated.` : `${user.email} deactivated.`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
      setDeactivating(null);
    }
  }

  return (
    <div className="space-y-4">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="input max-w-sm"
        placeholder="Search by email or name…"
        aria-label="Search users"
      />

      {users.loading && !users.data ? (
        <PageLoader label="Loading users…" />
      ) : users.error ? (
        <ErrorState message={users.error} onRetry={users.reload} />
      ) : !users.data || users.data.items.length === 0 ? (
        <EmptyState title="No users found" subtitle={search ? "Try a different search." : undefined} />
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Links</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.data.items.map((u) => (
                  <tr key={u.id} className="text-slate-700">
                    <td className="max-w-[18rem] px-4 py-3">
                      <p className="truncate font-medium text-slate-900">{u.email}</p>
                      <p className="truncate text-xs text-slate-500">
                        {u.display_name || "—"}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex flex-wrap gap-1">
                        {u.is_superuser && (
                          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                            Admin
                          </span>
                        )}
                        {!u.is_active && (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            Deactivated
                          </span>
                        )}
                        {!u.email_verified && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Unverified
                          </span>
                        )}
                        {u.is_active && u.email_verified && !u.is_superuser && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Active
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatNumber(u.link_count)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{formatDate(u.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {u.is_superuser ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : u.is_active ? (
                        <button
                          type="button"
                          onClick={() => {
                            setDisableLinks(true);
                            setDeactivating(u);
                          }}
                          disabled={busyId === u.id}
                          className="btn-danger text-xs"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetActive(u, true)}
                          disabled={busyId === u.id}
                          className="btn-secondary text-xs"
                        >
                          {busyId === u.id ? <Spinner className="h-3 w-3" /> : null}
                          Reactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            total={users.data.total}
            count={users.data.items.length}
            onChange={setOffset}
          />
        </>
      )}

      <Modal
        open={deactivating !== null}
        title="Deactivate this user?"
        onClose={() => setDeactivating(null)}
      >
        {deactivating && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>{deactivating.email}</strong> will be signed out everywhere and
              blocked from signing in until reactivated.
            </p>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={disableLinks}
                onChange={(e) => setDisableLinks(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Also disable their {formatNumber(deactivating.link_count)} link
              {deactivating.link_count === 1 ? "" : "s"} (stops redirects immediately)
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeactivating(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSetActive(deactivating, false, disableLinks)}
                disabled={busyId === deactivating.id}
                className="btn-danger"
              >
                {busyId === deactivating.id ? <Spinner className="h-4 w-4" /> : null}
                Deactivate
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
