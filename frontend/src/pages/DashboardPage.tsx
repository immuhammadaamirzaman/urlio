import { useState } from "react";

import { listLinks } from "../api/links";
import type { LinkRead, Page } from "../api/types";
import { CreateLinkForm } from "../components/CreateLinkForm";
import { EmptyState, ErrorState } from "../components/ErrorState";
import { LinkRow } from "../components/LinkRow";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { PageLoader } from "../components/Spinner";
import { useAsyncData } from "../hooks/useAsyncData";

const PAGE_SIZE = 20;

export function DashboardPage() {
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);

  const { data, loading, error, reload, setData } = useAsyncData<Page<LinkRead>>(
    () => listLinks({ limit: PAGE_SIZE, offset }),
    [offset],
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

      {loading && !data ? (
        <PageLoader label="Loading your links…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
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
