import type { TimeBucket } from "../api/types";

interface BarChartProps {
  data: TimeBucket[];
  bucket: "day" | "hour";
}

/** A dependency-free responsive bar chart for the click timeseries. */
export function BarChart({ data, bucket }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-slate-400">
        No click data for this period yet.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.count), 1);

  function label(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return bucket === "hour"
      ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // Show at most ~12 axis labels to avoid crowding.
  const labelEvery = Math.max(1, Math.ceil(data.length / 12));

  return (
    <div className="w-full overflow-x-auto">
      <div
        className="flex min-w-full items-end gap-1"
        style={{ height: "12rem" }}
        role="img"
        aria-label="Clicks over time"
      >
        {data.map((d, i) => {
          const heightPct = (d.count / max) * 100;
          return (
            <div key={i} className="group flex flex-1 flex-col items-center justify-end">
              <div className="relative flex w-full justify-center">
                <div
                  className="w-full max-w-[2rem] rounded-t bg-brand-500 transition-all group-hover:bg-brand-600"
                  style={{ height: `${Math.max(heightPct, d.count > 0 ? 4 : 0)}%` }}
                  title={`${d.count} clicks · ${label(d.bucket)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex min-w-full gap-1">
        {data.map((d, i) => (
          <div
            key={i}
            className="flex-1 truncate text-center text-[10px] text-slate-400"
          >
            {i % labelEvery === 0 ? label(d.bucket) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
