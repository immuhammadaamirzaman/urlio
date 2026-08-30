// Small presentation helpers shared across pages.

/*
 * Formatters are built once and reused. `toLocaleString` constructs an
 * `Intl.DateTimeFormat` on every call, which is the expensive part of formatting — and
 * the admin and dashboard tables format several dates per row across a 20-row page, so
 * that cost lands dozens of times per render. Built lazily so a locale-less environment
 * can't break module evaluation.
 */
function lazyFormatter(options: Intl.DateTimeFormatOptions) {
  let cached: Intl.DateTimeFormat | null = null;
  return () => (cached ??= new Intl.DateTimeFormat(undefined, options));
}

const dateTimeFormatter = lazyFormatter({
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const dateFormatter = lazyFormatter({
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Parse an ISO string, or `null` when it is absent or unparseable. */
function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(iso: string | null | undefined): string {
  const d = parseIso(iso);
  return d ? dateTimeFormatter().format(d) : "—";
}

export function formatDate(iso: string | null | undefined): string {
  const d = parseIso(iso);
  return d ? dateFormatter().format(d) : "—";
}

/** Human "time ago" string, e.g. "3h ago". Falls back to a date for older values. */
export function timeAgo(iso: string | null | undefined): string {
  const date = parseIso(iso);
  if (!date) return "never";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

// Same reasoning as the date formatters: this one runs on every click count and stat
// cell, so it should not rebuild an `Intl.NumberFormat` each time.
let numberFormatter: Intl.NumberFormat | null = null;

export function formatNumber(n: number): string {
  return (numberFormatter ??= new Intl.NumberFormat()).format(n);
}

/** Strip the scheme for a compact display of a target URL. */
export function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** Convert a `<input type="datetime-local">` value to an ISO-8601 string (or null). */
export function localDateTimeToIso(value: string): string | null {
  return parseIso(value)?.toISOString() ?? null;
}

/** Convert an ISO-8601 string to a `<input type="datetime-local">` value. */
export function isoToLocalDateTime(iso: string | null): string {
  const d = parseIso(iso);
  if (!d) return "";
  // Adjust for the local timezone offset so the displayed value matches local time.
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
