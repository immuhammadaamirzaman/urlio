import { useState } from "react";
import { Link } from "react-router-dom";

import { deleteLink } from "../api/links";
import type { LinkRead } from "../api/types";
import { useToast } from "../context/ToastContext";
import { errorMessage } from "../lib/errors";
import { formatNumber, prettyUrl, timeAgo } from "../lib/format";
import { CopyButton } from "./CopyButton";
import { EditLinkModal } from "./EditLinkModal";
import { LinkStatusBadges } from "./LinkStatusBadges";
import { Spinner } from "./Spinner";

interface LinkRowProps {
  link: LinkRead;
  onChanged: (link: LinkRead) => void;
  onDeleted: (id: string) => void;
}

export function LinkRow({ link, onChanged, onDeleted }: LinkRowProps) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteLink(link.id);
      onDeleted(link.id);
      toast.success("Link deleted.");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <a
            href={link.short_url}
            target="_blank"
            rel="noreferrer"
            className="truncate font-semibold text-brand-700 hover:underline dark:text-brand-300"
          >
            {prettyUrl(link.short_url)}
          </a>
          <CopyButton value={link.short_url} className="!px-2 !py-1" />
        </div>
        <p className="mt-0.5 truncate text-sm text-content-muted" title={link.target_url}>
          → {link.target_url}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <LinkStatusBadges link={link} />
          <span className="text-xs text-content-muted">
            {formatNumber(link.click_count)} clicks · last {timeAgo(link.last_clicked_at)}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Link to={`/dashboard/links/${link.id}`} className="btn-secondary text-xs">
          Analytics
        </Link>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn-secondary text-xs"
        >
          Edit
        </button>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="btn-danger text-xs"
            >
              {deleting ? <Spinner className="h-3 w-3" /> : null}
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="btn-ghost text-xs"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="btn-ghost text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15"
          >
            Delete
          </button>
        )}
      </div>

      {editing && (
        <EditLinkModal
          link={link}
          open={editing}
          onClose={() => setEditing(false)}
          onSaved={onChanged}
        />
      )}
    </div>
  );
}
