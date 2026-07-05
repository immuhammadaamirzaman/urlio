import type { LinkRead } from "../api/types";

export function isExpired(link: Pick<LinkRead, "expires_at">): boolean {
  if (!link.expires_at) return false;
  const t = new Date(link.expires_at).getTime();
  return !Number.isNaN(t) && t < Date.now();
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{children}</span>
  );
}

export function LinkStatusBadges({ link }: { link: LinkRead }) {
  const expired = isExpired(link);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!link.is_active ? (
        <Badge tone="bg-surface-muted text-content-muted">Inactive</Badge>
      ) : expired ? (
        <Badge tone="bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300">Expired</Badge>
      ) : (
        <Badge tone="bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300">Active</Badge>
      )}
      {link.is_custom_alias && (
        <Badge tone="bg-brand-500/15 text-brand-700 dark:text-brand-300">Custom</Badge>
      )}
      {link.has_password && (
        <Badge tone="bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          Password
        </Badge>
      )}
    </div>
  );
}
