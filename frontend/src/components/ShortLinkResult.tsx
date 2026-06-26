import type { LinkRead } from "../api/types";
import { prettyUrl } from "../lib/format";
import { CopyButton } from "./CopyButton";

export function ShortLinkResult({ link }: { link: LinkRead }) {
  return (
    <div className="card flex flex-col gap-3 border-brand-200 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <a
          href={link.short_url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-lg font-semibold text-brand-700 hover:underline"
        >
          {prettyUrl(link.short_url)}
        </a>
        <p className="truncate text-sm text-slate-500" title={link.target_url}>
          → {link.target_url}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {link.has_password && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Password
          </span>
        )}
        <CopyButton value={link.short_url} label="Copy link" />
      </div>
    </div>
  );
}
