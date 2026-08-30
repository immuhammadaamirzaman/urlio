import type { TimeBucket } from "../api/types";

type Bucket = "day" | "hour";

interface BarChartProps {
  data: TimeBucket[];
  bucket: Bucket;
}

function bucketLabel(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return bucket === "hour"
    ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** A dependency-free responsive bar chart for the click timeseries. */
export function BarChart({ data, bucket }: BarChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-content-subtle">
        No click data for this period yet.
      </div>
    );
  }

  // Reduced rather than `Math.max(...data.map(…))`: spreading an array into arguments
  // is bounded by the engine's call-stack limit, and an hourly series over a long
  // window is not bounded by anything we control here.
  const max = data.reduce((acc, d) => (d.count > acc ? d.count : acc), 1);

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
        {data.map((d) => {
          const heightPct = (d.count / max) * 100;
          return (
            <div key={d.bucket} className="group flex flex-1 flex-col justify-end">
              <div
                className="mx-auto w-full max-w-[2rem] rounded-t bg-brand-500 transition-all group-hover:bg-brand-600"
                style={{ height: `${Math.max(heightPct, d.count > 0 ? 4 : 0)}%` }}
                title={`${d.count} clicks · ${bucketLabel(d.bucket, bucket)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex min-w-full gap-1">
        {data.map((d, i) => (
          <div
            key={d.bucket}
            className="flex-1 truncate text-center text-[10px] text-content-subtle"
          >
            {i % labelEvery === 0 ? bucketLabel(d.bucket, bucket) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
