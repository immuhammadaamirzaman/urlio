import type { LinkRead } from "../api/types";
import { prettyUrl } from "../lib/format";
import { isPreviewId } from "../lib/guestSandbox";
import { CopyButton } from "./CopyButton";

export function ShortLinkResult({ link }: { link: LinkRead }) {
  return (
    <div className="card flex flex-col gap-3 border-brand-200 bg-brand-500/10 p-4 dark:border-brand-500/30 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <a
          href={link.short_url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-lg font-semibold text-brand-700 hover:underline dark:text-brand-300"
        >
          {prettyUrl(link.short_url)}
        </a>
        <p className="truncate text-sm text-content-muted" title={link.target_url}>
          → {link.target_url}
        </p>
        {/* Said here, at the moment of creation, because this is where someone would
            otherwise copy the URL and send it to a colleague. */}
        {isPreviewId(link.id) && (
          <p className="mt-1 text-xs font-medium text-violet-700 dark:text-violet-300">
            Preview only — this link doesn&apos;t redirect, and it disappears when you leave
            the guest preview.
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {link.has_password && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            Password
          </span>
        )}
        <CopyButton value={link.short_url} label="Copy link" />
      </div>
    </div>
  );
}
