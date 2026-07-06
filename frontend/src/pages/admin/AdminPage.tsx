import { useState } from "react";

import { adminStats } from "../../api/admin";
import type { AdminStats } from "../../api/types";
import { BarChart } from "../../components/BarChart";
import { ErrorState } from "../../components/ErrorState";
import { PageLoader } from "../../components/Spinner";
import { StatCard } from "../../components/StatCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import { formatNumber } from "../../lib/format";
import { AdminAuditTab } from "./AdminAuditTab";
import { AdminLinksTab } from "./AdminLinksTab";
import { AdminUsersTab } from "./AdminUsersTab";

const TABS = ["Overview", "Users", "Links", "Audit"] as const;
type Tab = (typeof TABS)[number];

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("Overview");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-content">Admin</h1>
        <p className="text-sm text-content-muted">
          Moderate users and links, and keep an eye on platform health.
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-border p-0.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 font-medium transition-colors ${
              tab === t ? "bg-brand-600 text-white" : "text-content-muted hover:bg-surface-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab />}
      {tab === "Users" && <AdminUsersTab />}
      {tab === "Links" && <AdminLinksTab />}
      {tab === "Audit" && <AdminAuditTab />}
    </div>
  );
}

function OverviewTab() {
  const stats = useAsyncData<AdminStats>(() => adminStats(), []);

  if (stats.loading && !stats.data) return <PageLoader label="Loading platform stats…" />;
  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />;
  if (!stats.data) return null;
  const s = stats.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={formatNumber(s.total_users)} hint={`${formatNumber(s.active_users)} active`} />
        <StatCard label="Links" value={formatNumber(s.total_links)} hint={`${formatNumber(s.active_links)} active`} />
        <StatCard label="Total clicks" value={formatNumber(s.total_clicks)} />
        <StatCard label="Clicks (24h)" value={formatNumber(s.clicks_last_24h)} />
        <StatCard label="New users (7d)" value={formatNumber(s.new_users_last_7d)} />
        <StatCard label="New links (7d)" value={formatNumber(s.new_links_last_7d)} />
      </div>

      <div className="card p-5">
        <h2 className="mb-4 text-base font-semibold text-content">
          Clicks per day (last 14 days)
        </h2>
        <BarChart data={s.clicks_per_day} bucket="day" />
      </div>
    </div>
  );
}
