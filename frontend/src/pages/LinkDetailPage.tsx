import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { getLinkStats, listClicks } from "../api/analytics";
import { getLink } from "../api/links";
import type { ClickRead, LinkRead, LinkStats, Page } from "../api/types";
import { BarChart } from "../components/BarChart";
import { CopyButton } from "../components/CopyButton";
import { EmptyState, ErrorState } from "../components/ErrorState";
import { LinkStatusBadges } from "../components/LinkStatusBadges";
import { Pagination } from "../components/Pagination";
import { PageLoader, Spinner } from "../components/Spinner";
import { StatCard } from "../components/StatCard";
import { useAsyncData } from "../hooks/useAsyncData";
import { formatDateTime, formatNumber, prettyUrl, timeAgo } from "../lib/format";

const CLICKS_PAGE_SIZE = 20;

export function LinkDetailPage() {
  const { id = "" } = useParams();
  const [bucket, setBucket] = useState<"day" | "hour">("day");
  const [offset, setOffset] = useState(0);

  const link = useAsyncData<LinkRead>(() => getLink(id), [id]);
  const stats = useAsyncData<LinkStats>(() => getLinkStats(id, bucket), [id, bucket]);
  const clicks = useAsyncData<Page<ClickRead>>(
    () => listClicks(id, { limit: CLICKS_PAGE_SIZE, offset }),
    [id, offset],
  );

  if (link.loading && !link.data) return <PageLoader label="Loading link…" />;
  if (link.error) return <ErrorState message={link.error} onRetry={link.reload} />;
  if (!link.data) return null;

  const l = link.data;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard" className="text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline">
          ← Back to links
        </Link>
      </div>

      {/* Link header */}
      <div className="card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <a
                href={l.short_url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-xl font-bold text-brand-700 dark:text-brand-300 hover:underline"
              >
                {prettyUrl(l.short_url)}
              </a>
              <CopyButton value={l.short_url} />
            </div>
            <p className="mt-1 truncate text-sm text-content-muted" title={l.target_url}>
              → {l.target_url}
            </p>
            <div className="mt-3">
              <LinkStatusBadges link={l} />
            </div>
          </div>
          <dl className="shrink-0 text-right text-xs text-content-muted">
            <dt className="inline">Created </dt>
            <dd className="inline font-medium text-content">
              {formatDateTime(l.created_at)}
            </dd>
            {l.expires_at && (
              <>
                <br />
                <dt className="inline">Expires </dt>
                <dd className="inline font-medium text-content">
                  {formatDateTime(l.expires_at)}
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {/* Stat cards */}
      {stats.error ? (
        <ErrorState message={stats.error} onRetry={stats.reload} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total clicks" value={formatNumber(stats.data?.total_clicks ?? l.click_count)} />
          <StatCard
            label="Unique visitors"
            value={formatNumber(stats.data?.unique_ip_estimate ?? 0)}
            hint="estimated"
          />
          <StatCard label="Last clicked" value={timeAgo(l.last_clicked_at)} />
          <StatCard
            label="Top referrer"
            value={
              stats.data?.top_referrers?.[0]?.referrer
                ? prettyUrl(stats.data.top_referrers[0].referrer)
                : "Direct"
            }
          />
        </div>
      )}

      {/* Timeseries chart */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-content">Clicks over time</h2>
          <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
            {(["day", "hour"] as const).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBucket(b)}
                className={`rounded-md px-3 py-1 font-medium capitalize transition-colors ${
                  bucket === b ? "bg-brand-600 text-white" : "text-content-muted hover:bg-surface-muted"
                }`}
              >
                {b === "day" ? "Daily" : "Hourly"}
              </button>
            ))}
          </div>
        </div>
        {stats.loading && !stats.data ? (
          <div className="flex h-48 items-center justify-center">
            <Spinner className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>
        ) : (
          <BarChart data={stats.data?.timeseries ?? []} bucket={bucket} />
        )}
      </div>

      {/* Top referrers / countries */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-content">Top referrers</h2>
          {stats.data && stats.data.top_referrers.length > 0 ? (
            <ul className="divide-y divide-border">
              {stats.data.top_referrers.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="truncate text-content">
                    {r.referrer ? prettyUrl(r.referrer) : "Direct / none"}
                  </span>
                  <span className="font-medium text-content">{formatNumber(r.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-content-subtle">No referrer data yet.</p>
          )}
        </div>

        <div className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-content">Top countries</h2>
          {stats.data && stats.data.top_countries.length > 0 ? (
            <ul className="divide-y divide-border">
              {stats.data.top_countries.map((c) => (
                <li key={c.country} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-content">{c.country}</span>
                  <span className="font-medium text-content">{formatNumber(c.count)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-sm text-content-subtle">
              No country data yet. Country tracking requires a CDN/proxy header
              (see COUNTRY_HEADER).
            </p>
          )}
        </div>
      </div>

      {/* Recent clicks */}
      <div className="card p-5">
        <h2 className="mb-3 text-base font-semibold text-content">Recent clicks</h2>
        {clicks.error ? (
          <ErrorState message={clicks.error} onRetry={clicks.reload} />
        ) : clicks.loading && !clicks.data ? (
          <div className="flex h-24 items-center justify-center">
            <Spinner className="h-6 w-6 text-brand-600 dark:text-brand-400" />
          </div>
        ) : !clicks.data || clicks.data.items.length === 0 ? (
          <EmptyState title="No clicks recorded yet" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-content-muted">
                    <th className="py-2 pr-4 font-medium">When</th>
                    <th className="py-2 pr-4 font-medium">Referrer</th>
                    <th className="py-2 pr-4 font-medium">Country</th>
                    <th className="py-2 font-medium">User agent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clicks.data.items.map((c) => (
                    <tr key={c.id} className="text-content">
                      <td className="whitespace-nowrap py-2 pr-4">
                        {formatDateTime(c.clicked_at)}
                      </td>
                      <td className="max-w-[12rem] truncate py-2 pr-4" title={c.referrer ?? ""}>
                        {c.referrer ? prettyUrl(c.referrer) : "—"}
                      </td>
                      <td className="py-2 pr-4">{c.country ?? "—"}</td>
                      <td className="max-w-[16rem] truncate py-2" title={c.user_agent ?? ""}>
                        {c.user_agent ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              offset={offset}
              limit={CLICKS_PAGE_SIZE}
              total={clicks.data.total}
              count={clicks.data.items.length}
              onChange={setOffset}
            />
          </>
        )}
      </div>
    </div>
  );
}
