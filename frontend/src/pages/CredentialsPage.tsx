import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import {
  bulkDecryptCredentials,
  changeCredentialPassword,
  decryptCredential,
  deleteCredential,
  listCredentials,
  updateCredential,
} from "../api/credentials";
import type {
  CredentialListResponse,
  CredentialUpdateRequest,
  DecryptedCredential,
} from "../api/credentials";
import { CopyButton } from "../components/CopyButton";
import { CreateCredentialModal } from "../components/CreateCredentialModal";
import { CredentialFormFields } from "../components/CredentialFormFields";
import { EmptyState, ErrorState } from "../components/ErrorState";
import { MasterPasswordModal } from "../components/MasterPasswordModal";
import type { PendingAction } from "../components/MasterPasswordModal";
import { Pagination } from "../components/Pagination";
import { ChevronDownIcon } from "../components/ServiceIcons";
import { PageLoader } from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { useAsyncData } from "../hooks/useAsyncData";
import type {
  CredentialFieldErrors,
  CredentialFieldValues,
} from "../lib/credentialFields";
import { isCredentialField, validateCredentialFields } from "../lib/credentialFields";
import { errorMessage } from "../lib/errors";
import { formatDate } from "../lib/format";

const PAGE_SIZE = 20;
/** Matches the backend's cap on a single bulk-decrypt request. */
const MAX_BULK_SELECTION = 100;

const EMPTY_VALUES: CredentialFieldValues = {
  masterPassword: "",
  usernameOrEmail: "",
  password: "",
  detail: "",
  url: "",
};

function valuesFrom(credential: DecryptedCredential): CredentialFieldValues {
  return {
    // Never prefilled: the master password is re-entered to authorize each write.
    masterPassword: "",
    usernameOrEmail: credential.username_or_email,
    password: credential.password,
    detail: credential.detail,
    url: credential.url ?? "",
  };
}

export function CredentialsPage() {
  const toast = useToast();
  const [offset, setOffset] = useState(0);

  const { data, loading, error, reload } = useAsyncData<CredentialListResponse>(
    (signal) => listCredentials({ limit: PAGE_SIZE, offset }, signal),
    [offset],
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [decryptedMap, setDecryptedMap] = useState<Map<string, DecryptedCredential>>(
    new Map(),
  );
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Inline edit state. Only one row edits at a time, so a single set is enough.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<CredentialFieldValues>(EMPTY_VALUES);
  const [editLoading, setEditLoading] = useState(false);
  const [editFieldErrors, setEditFieldErrors] = useState<CredentialFieldErrors>({});

  // Change-master-password form state.
  const [changingPasswordId, setChangingPasswordId] = useState<string | null>(null);
  const [cpCurrentPassword, setCpCurrentPassword] = useState("");
  const [cpNewPassword, setCpNewPassword] = useState("");
  const [cpLoading, setCpLoading] = useState(false);
  const [cpCurrentPasswordError, setCpCurrentPasswordError] = useState("");

  // Selections are page-scoped; clear them when paging.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [offset]);

  function cacheDecrypted(credentials: DecryptedCredential[]) {
    setDecryptedMap((prev) => {
      const next = new Map(prev);
      for (const c of credentials) next.set(c.id, c);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BULK_SELECTION) next.add(id);
      else return prev;
      return next;
    });
  }

  // --- Action handlers ---

  function handleDecrypt(id: string) {
    setPendingAction({
      label: "Decrypt credential",
      onSubmit: async (masterPassword) => {
        const result = await decryptCredential(id, { master_password: masterPassword });
        cacheDecrypted([result]);
        toast.success("Credential decrypted.");
      },
    });
  }

  function handleBulkDecrypt() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setPendingAction({
      label: `Decrypt ${ids.length} credential${ids.length === 1 ? "" : "s"}`,
      onSubmit: async (masterPassword) => {
        const result = await bulkDecryptCredentials({
          master_password: masterPassword,
          credential_ids: ids,
        });
        cacheDecrypted(result.successes);
        setSelectedIds(new Set());
        if (result.success_count > 0) {
          toast.success(
            `Decrypted ${result.success_count} credential${result.success_count === 1 ? "" : "s"}.`,
          );
        }
        if (result.failure_count > 0) {
          toast.error(
            `${result.failure_count} credential${result.failure_count === 1 ? "" : "s"} could not be decrypted.`,
          );
        }
      },
    });
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Are you sure you want to delete this credential?")) return;
    try {
      await deleteCredential(id);
      toast.success("Credential deleted.");
      setExpandedId(null);
      setDecryptedMap((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      reload();
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.code === "credential_not_found"
          ? "Credential not found."
          : errorMessage(err),
      );
      // Either way the list is out of date, so refetch it.
      reload();
    }
  }

  async function handleChangePasswordSubmit(e: FormEvent, credentialId: string) {
    e.preventDefault();
    setCpCurrentPasswordError("");
    setCpLoading(true);
    try {
      await changeCredentialPassword(credentialId, {
        current_password: cpCurrentPassword,
        new_password: cpNewPassword,
      });
      toast.success("Master password changed.");
      setChangingPasswordId(null);
      setCpCurrentPassword("");
      setCpNewPassword("");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_master_password") {
        setCpCurrentPasswordError("Incorrect current master password.");
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setCpLoading(false);
    }
  }

  function startEditForm(credential: DecryptedCredential) {
    setEditingId(credential.id);
    setEditValues(valuesFrom(credential));
    setEditFieldErrors({});
  }

  function handleEdit(id: string) {
    const cached = decryptedMap.get(id);
    if (cached) {
      startEditForm(cached);
      return;
    }
    // Editing needs the current plaintext to diff against, so decrypt first.
    setPendingAction({
      label: "Decrypt to edit",
      onSubmit: async (masterPassword) => {
        const result = await decryptCredential(id, { master_password: masterPassword });
        cacheDecrypted([result]);
        startEditForm(result);
      },
    });
  }

  async function handleEditSubmit(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();

    const original = decryptedMap.get(id);
    if (!original) {
      toast.error("Decrypt this credential again before saving.");
      setEditingId(null);
      return;
    }

    const errors = validateCredentialFields(editValues);
    if (Object.keys(errors).length > 0) {
      setEditFieldErrors(errors);
      return;
    }

    setEditFieldErrors({});
    setEditLoading(true);

    // Send only what actually changed; `master_password` always goes along to authorize.
    const updates: CredentialUpdateRequest = { master_password: editValues.masterPassword };
    const nextUrl = editValues.url || null;
    if (editValues.usernameOrEmail !== original.username_or_email) {
      updates.username_or_email = editValues.usernameOrEmail;
    }
    if (editValues.password !== original.password) updates.password = editValues.password;
    if (editValues.detail !== original.detail) updates.detail = editValues.detail;
    if (nextUrl !== original.url) updates.url = nextUrl;

    try {
      await updateCredential(id, updates);
      toast.success("Credential updated successfully.");
      setEditingId(null);
      cacheDecrypted([
        {
          ...original,
          username_or_email: editValues.usernameOrEmail,
          password: editValues.password,
          detail: editValues.detail,
          url: nextUrl,
        },
      ]);
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setEditFieldErrors(
          isCredentialField(err.field)
            ? { [err.field]: err.message }
            : { detail: err.message },
        );
      } else if (err instanceof ApiError && err.code === "invalid_master_password") {
        setEditFieldErrors({ master_password: "Incorrect master password." });
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Credentials</h1>
          <p className="text-sm text-content-muted">
            Manage your encrypted credentials securely.
          </p>
        </div>
        <button type="button" onClick={() => setShowCreateModal(true)} className="btn-primary">
          + New credential
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-content-muted">{selectedIds.size} selected</span>
          <button type="button" className="btn-primary text-sm" onClick={handleBulkDecrypt}>
            Decrypt selected
          </button>
          <button
            type="button"
            className="btn-ghost text-sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      {loading && !data ? (
        <PageLoader label="Loading credentials…" />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="No credentials yet"
          subtitle="Create your first credential to get started."
        />
      ) : (
        <>
          <div className="space-y-3">
            {data.items.map((credential) => {
              const expanded = expandedId === credential.id;
              const decrypted = decryptedMap.get(credential.id);
              const isEditing = editingId === credential.id;
              return (
                <div key={credential.id}>
                  {/* The checkbox is a sibling of the expand button rather than a child:
                      one interactive control may not nest inside another. */}
                  <div
                    className={`card flex items-center gap-4 p-4 transition-colors hover:bg-surface-muted ${
                      expanded ? "rounded-b-none border-b-0" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(credential.id)}
                      onChange={() => toggleSelected(credential.id)}
                      className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
                      aria-label={`Select ${credential.detail}`}
                    />
                    <button
                      type="button"
                      onClick={() => toggleExpanded(credential.id)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-content">
                          {credential.detail}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-3 text-xs text-content-muted">
                          <span>Created: {formatDate(credential.created_at)}</span>
                          <span>Updated: {formatDate(credential.updated_at)}</span>
                        </span>
                      </span>
                      <ChevronDownIcon
                        className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {expanded && (
                    <div className="card rounded-t-none border-t-0 border-l-4 border-l-brand-500 bg-surface p-4 pl-6">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-primary text-sm"
                          onClick={() => handleDecrypt(credential.id)}
                        >
                          Decrypt
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => handleEdit(credential.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => {
                            setChangingPasswordId(credential.id);
                            setCpCurrentPassword("");
                            setCpNewPassword("");
                            setCpCurrentPasswordError("");
                          }}
                        >
                          Change Password
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          onClick={() => handleDelete(credential.id)}
                        >
                          Delete
                        </button>
                      </div>

                      {decrypted && !isEditing && (
                        <div className="mt-4 space-y-3 rounded-lg border border-border bg-canvas p-4">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-content-muted">
                              Username/Email:
                            </span>
                            <span className="text-sm text-content">
                              {decrypted.username_or_email}
                            </span>
                            <CopyButton
                              value={decrypted.username_or_email}
                              label="Copy username"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-content-muted">
                              Password:
                            </span>
                            <span className="text-sm text-content">•••••••</span>
                            <CopyButton value={decrypted.password} label="Copy password" />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-content-muted">
                              Detail:
                            </span>
                            <span className="text-sm text-content">{decrypted.detail}</span>
                          </div>
                          {decrypted.url && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-content-muted">
                                URL:
                              </span>
                              <span className="text-sm text-content">{decrypted.url}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {isEditing && (
                        <form
                          className="mt-4 space-y-3 rounded-lg border border-border bg-canvas p-4"
                          onSubmit={(e) => handleEditSubmit(e, credential.id)}
                        >
                          <h3 className="text-sm font-semibold text-content">
                            Edit Credential
                          </h3>
                          <CredentialFormFields
                            values={editValues}
                            errors={editFieldErrors}
                            onChange={(patch) =>
                              setEditValues((prev) => ({ ...prev, ...patch }))
                            }
                          />
                          <div className="flex gap-2 pt-2">
                            <button
                              type="submit"
                              className="btn-primary text-sm"
                              disabled={editLoading}
                            >
                              {editLoading ? "Saving…" : "Save Changes"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary text-sm"
                              onClick={() => setEditingId(null)}
                              disabled={editLoading}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}

                      {changingPasswordId === credential.id && (
                        <form
                          className="mt-4 space-y-3 rounded-lg border border-border bg-canvas p-4"
                          onSubmit={(e) => handleChangePasswordSubmit(e, credential.id)}
                        >
                          <h4 className="text-sm font-semibold text-content">
                            Change Master Password
                          </h4>

                          <div className="space-y-1">
                            <label className="label" htmlFor={`cp-current-${credential.id}`}>
                              Current Master Password
                            </label>
                            <input
                              id={`cp-current-${credential.id}`}
                              type="password"
                              required
                              minLength={8}
                              maxLength={128}
                              value={cpCurrentPassword}
                              onChange={(e) => {
                                setCpCurrentPassword(e.target.value);
                                setCpCurrentPasswordError("");
                              }}
                              className="input"
                              placeholder="Enter current master password"
                              aria-invalid={cpCurrentPasswordError ? true : undefined}
                              aria-describedby={
                                cpCurrentPasswordError
                                  ? `cp-current-error-${credential.id}`
                                  : undefined
                              }
                            />
                            {cpCurrentPasswordError && (
                              <p
                                id={`cp-current-error-${credential.id}`}
                                className="text-xs text-red-600 dark:text-red-400"
                              >
                                {cpCurrentPasswordError}
                              </p>
                            )}
                          </div>

                          <div className="space-y-1">
                            <label className="label" htmlFor={`cp-new-${credential.id}`}>
                              New Master Password
                            </label>
                            <input
                              id={`cp-new-${credential.id}`}
                              type="password"
                              required
                              minLength={8}
                              maxLength={128}
                              value={cpNewPassword}
                              onChange={(e) => setCpNewPassword(e.target.value)}
                              className="input"
                              placeholder="Enter new master password (min 8 characters)"
                            />
                          </div>

                          <div className="flex gap-2">
                            <button
                              type="submit"
                              disabled={
                                cpLoading ||
                                cpCurrentPassword.length < 8 ||
                                cpNewPassword.length < 8
                              }
                              className="btn-primary text-sm"
                            >
                              {cpLoading ? "Changing…" : "Change Password"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary text-sm"
                              onClick={() => {
                                setChangingPasswordId(null);
                                setCpCurrentPassword("");
                                setCpNewPassword("");
                                setCpCurrentPasswordError("");
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Pagination
            offset={offset}
            limit={PAGE_SIZE}
            total={data.total}
            count={data.items.length}
            onChange={setOffset}
          />
        </>
      )}

      <CreateCredentialModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          reload();
          setShowCreateModal(false);
        }}
      />

      <MasterPasswordModal action={pendingAction} onClose={() => setPendingAction(null)} />
    </div>
  );
}
