import { useState } from "react";

import { adminAuditLog } from "../../api/admin";
import type { AuditRead, Page } from "../../api/types";
import { EmptyState, ErrorState } from "../../components/ErrorState";
import { Pagination } from "../../components/Pagination";
import { PageLoader } from "../../components/Spinner";
import { useAsyncData } from "../../hooks/useAsyncData";
import { formatDateTime } from "../../lib/format";

const PAGE_SIZE = 20;

const ACTION_STYLES: Record<string, string> = {
  "user.deactivate": "bg-red-50 text-red-700",
  "user.reactivate": "bg-emerald-50 text-emerald-700",
  "link.disable": "bg-amber-50 text-amber-700",
  "link.enable": "bg-emerald-50 text-emerald-700",
  "link.delete": "bg-red-50 text-red-700",
};

export function AdminAuditTab() {
  const [offset, setOffset] = useState(0);
  const audit = useAsyncData<Page<AuditRead>>(
    () => adminAuditLog({ limit: PAGE_SIZE, offset }),
    [offset],
  );

  if (audit.loading && !audit.data) return <PageLoader label="Loading audit log…" />;
  if (audit.error) return <ErrorState message={audit.error} onRetry={audit.reload} />;
  if (!audit.data || audit.data.items.length === 0) {
    return <EmptyState title="No admin actions yet" subtitle="Moderation actions will appear here." />;
  }

  return (
    <div className="space-y-4">
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
              <th className="px-4 py-3 font-medium">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {audit.data.items.map((entry) => (
              <tr key={entry.id} className="text-slate-700">
                <td className="whitespace-nowrap px-4 py-3">
                  {formatDateTime(entry.created_at)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      ACTION_STYLES[entry.action] ?? "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {entry.action}
                  </span>
                </td>
                <td className="max-w-[16rem] truncate px-4 py-3" title={entry.target_id}>
                  <span className="text-xs uppercase text-slate-400">{entry.target_type}</span>{" "}
                  {entry.target_id}
                </td>
                <td className="max-w-[20rem] truncate px-4 py-3" title={entry.detail ?? ""}>
                  {entry.detail ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        offset={offset}
        limit={PAGE_SIZE}
        total={audit.data.total}
        count={audit.data.items.length}
        onChange={setOffset}
      />
    </div>
  );
}
