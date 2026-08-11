import { useEffect, useState, type FormEvent } from "react";

import { ApiError } from "../api/client";
import { changeCredentialPassword, decryptCredential, deleteCredential, listCredentials, updateCredential } from "../api/credentials";
import type { CredentialListResponse, CredentialUpdateRequest, DecryptedCredential } from "../api/credentials";
import { CopyButton } from "../components/CopyButton";
import { CreateCredentialModal } from "../components/CreateCredentialModal";
import { EmptyState, ErrorState } from "../components/ErrorState";
import { MasterPasswordModal } from "../components/MasterPasswordModal";
import type { PendingAction } from "../components/MasterPasswordModal";
import { Pagination } from "../components/Pagination";
import { PageLoader } from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { useAsyncData } from "../hooks/useAsyncData";

const PAGE_SIZE = 20;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export function CredentialsPage() {
  const toast = useToast();
  const [offset, setOffset] = useState(0);

  const { data, loading, error, reload } = useAsyncData<CredentialListResponse>(
    (signal) => listCredentials({ limit: PAGE_SIZE, offset }, signal),
    [offset],
  );

  // Expand/collapse
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Clear selection when page changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [offset]);

  // Decrypted data cache
  const [decryptedMap, setDecryptedMap] = useState<Map<string, DecryptedCredential>>(new Map());

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Master password modal (callback pattern)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMasterPassword, setEditMasterPassword] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editDetail, setEditDetail] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editFieldErrors, setEditFieldErrors] = useState<Record<string, string>>({});

  // Change password form state
  const [changingPasswordId, setChangingPasswordId] = useState<string | null>(null);
  const [cpCurrentPassword, setCpCurrentPassword] = useState("");
  const [cpNewPassword, setCpNewPassword] = useState("");
  const [cpLoading, setCpLoading] = useState(false);
  const [cpCurrentPasswordError, setCpCurrentPasswordError] = useState("");

  // --- Action handlers ---

  function handleDecrypt(id: string) {
    setPendingAction({
      label: "Decrypt credential",
      onSubmit: async (masterPassword) => {
        const result = await decryptCredential(id, { master_password: masterPassword });
        setDecryptedMap((prev) => new Map(prev).set(id, result));
        toast.success("Credential decrypted.");
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
        const m = new Map(prev);
        m.delete(id);
        return m;
      });
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === "credential_not_found") {
        toast.error("Credential not found.");
        reload();
      } else {
        throw err;
      }
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
        throw err;
      }
    } finally {
      setCpLoading(false);
    }
  }

  function handleBulkDecrypt() {
    // Will be implemented in Task 6.2
  }

  function startEditForm(id: string) {
    const decrypted = decryptedMap.get(id)!;
    setEditingId(id);
    setEditMasterPassword("");
    setEditUsername(decrypted.username_or_email);
    setEditPassword(decrypted.password);
    setEditDetail(decrypted.detail);
    setEditUrl(decrypted.url || "");
    setEditFieldErrors({});
  }

  function handleEdit(id: string) {
    if (decryptedMap.has(id)) {
      startEditForm(id);
    } else {
      // Need to decrypt first
      setPendingAction({
        label: "Decrypt to edit",
        onSubmit: async (masterPassword) => {
          const result = await decryptCredential(id, { master_password: masterPassword });
          setDecryptedMap((prev) => new Map(prev).set(id, result));
          // Start edit form after decrypt succeeds
          setEditingId(id);
          setEditMasterPassword("");
          setEditUsername(result.username_or_email);
          setEditPassword(result.password);
          setEditDetail(result.detail);
          setEditUrl(result.url || "");
          setEditFieldErrors({});
        },
      });
    }
  }

  function validateEditFields(): Record<string, string> {
    const errors: Record<string, string> = {};

    if (!editMasterPassword || editMasterPassword.length < 8) {
      errors.master_password = "Master password must be at least 8 characters.";
    } else if (editMasterPassword.length > 128) {
      errors.master_password = "Master password must be at most 128 characters.";
    }

    if (!editUsername || editUsername.length < 1) {
      errors.username_or_email = "Username or email is required.";
    } else if (editUsername.length > 255) {
      errors.username_or_email = "Username or email must be at most 255 characters.";
    }

    if (!editPassword || editPassword.length < 1) {
      errors.password = "Password is required.";
    } else if (editPassword.length > 1024) {
      errors.password = "Password must be at most 1024 characters.";
    }

    if (!editDetail || editDetail.length < 1) {
      errors.detail = "Detail/label is required.";
    } else if (editDetail.length > 255) {
      errors.detail = "Detail/label must be at most 255 characters.";
    }

    if (editUrl && editUrl.length > 2048) {
      errors.url = "URL must be at most 2048 characters.";
    }

    return errors;
  }

  async function handleEditSubmit(e: FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();

    const errors = validateEditFields();
    if (Object.keys(errors).length > 0) {
      setEditFieldErrors(errors);
      return;
    }

    setEditFieldErrors({});
    setEditLoading(true);

    const original = decryptedMap.get(id)!;
    const updates: CredentialUpdateRequest = { master_password: editMasterPassword };

    if (editUsername !== original.username_or_email) updates.username_or_email = editUsername;
    if (editPassword !== original.password) updates.password = editPassword;
    if (editDetail !== original.detail) updates.detail = editDetail;
    if ((editUrl || null) !== original.url) updates.url = editUrl || null;

    try {
      await updateCredential(id, updates);
      toast.success("Credential updated successfully.");
      setEditingId(null);
      // Update the decrypted map with new values
      setDecryptedMap((prev) => {
        const m = new Map(prev);
        m.set(id, {
          ...original,
          username_or_email: editUsername,
          password: editPassword,
          detail: editDetail,
          url: editUrl || null,
        });
        return m;
      });
      reload();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 422) {
          const fieldErr: Record<string, string> = {};
          if (err.field) {
            fieldErr[err.field] = err.message;
          } else {
            fieldErr.detail = err.message;
          }
          setEditFieldErrors(fieldErr);
        } else if (err.code === "invalid_master_password") {
          setEditFieldErrors({ master_password: "Incorrect master password." });
        } else {
          toast.error(err.message || "Something went wrong.");
        }
      } else {
        toast.error("An unexpected error occurred.");
      }
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content">Credentials</h1>
          <p className="text-sm text-content-muted">
            Manage your encrypted credentials securely.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="btn-primary"
        >
          + New credential
        </button>
      </div>

      {/* Bulk decrypt controls */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-content-muted">{selectedIds.size} selected</span>
          <button type="button" className="btn-primary text-sm" onClick={handleBulkDecrypt}>
            Decrypt selected
          </button>
        </div>
      )}

      {/* List / Loading / Error / Empty states */}
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
            {data.items.map((credential) => (
              <div key={credential.id}>
                <div
                  className={`card flex items-center justify-between gap-4 p-4 transition-colors hover:bg-surface-hover ${
                    expandedId === credential.id ? "rounded-b-none border-b-0" : ""
                  }`}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === credential.id ? null : credential.id,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId((prev) =>
                        prev === credential.id ? null : credential.id,
                      );
                    }
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(credential.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(credential.id)) {
                          next.delete(credential.id);
                        } else {
                          if (next.size >= 100) return prev;
                          next.add(credential.id);
                        }
                        return next;
                      });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
                    aria-label={`Select ${credential.detail}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-content">
                      {credential.detail}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-content-muted">
                      <span>Created: {formatDate(credential.created_at)}</span>
                      <span>Updated: {formatDate(credential.updated_at)}</span>
                    </div>
                  </div>
                  <svg
                    className={`h-4 w-4 shrink-0 text-content-muted transition-transform ${
                      expandedId === credential.id ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded Panel */}
                {expandedId === credential.id && (
                  <div className="card rounded-t-none border-t-0 border-l-4 border-l-accent bg-surface p-4 pl-6">
                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-primary text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDecrypt(credential.id);
                        }}
                      >
                        Decrypt
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(credential.id);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-sm"
                        onClick={(e) => {
                          e.stopPropagation();
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
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(credential.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>

                    {/* Decrypted fields */}
                    {decryptedMap.has(credential.id) && editingId !== credential.id && (
                      <div className="mt-4 space-y-3 rounded-lg border border-border bg-surface-raised p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-content-muted">Username/Email:</span>
                          <span className="text-sm text-content">
                            {decryptedMap.get(credential.id)!.username_or_email}
                          </span>
                          <CopyButton
                            value={decryptedMap.get(credential.id)!.username_or_email}
                            label="Copy username"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-content-muted">Password:</span>
                          <span className="text-sm text-content">&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
                          <CopyButton
                            value={decryptedMap.get(credential.id)!.password}
                            label="Copy password"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-content-muted">Detail:</span>
                          <span className="text-sm text-content">
                            {decryptedMap.get(credential.id)!.detail}
                          </span>
                        </div>
                        {decryptedMap.get(credential.id)!.url && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-content-muted">URL:</span>
                            <span className="text-sm text-content">
                              {decryptedMap.get(credential.id)!.url}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Inline Edit Form */}
                    {editingId === credential.id && (
                      <form
                        className="mt-4 space-y-3 rounded-lg border border-border bg-surface-raised p-4"
                        onSubmit={(e) => handleEditSubmit(e, credential.id)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <h3 className="text-sm font-semibold text-content">Edit Credential</h3>

                        {/* Master Password */}
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-content" htmlFor={`edit-master-password-${credential.id}`}>
                            Master Password
                          </label>
                          <input
                            id={`edit-master-password-${credential.id}`}
                            type="password"
                            value={editMasterPassword}
                            onChange={(e) => setEditMasterPassword(e.target.value)}
                            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
                            placeholder="Enter your master password"
                            required
                            minLength={8}
                            maxLength={128}
                          />
                          {editFieldErrors.master_password && (
                            <p className="text-xs text-red-600 dark:text-red-400">{editFieldErrors.master_password}</p>
                          )}
                        </div>

                        {/* Username or Email */}
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-content" htmlFor={`edit-username-${credential.id}`}>
                            Username or Email
                          </label>
                          <input
                            id={`edit-username-${credential.id}`}
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
                            placeholder="user@example.com"
                            required
                            maxLength={255}
                          />
                          {editFieldErrors.username_or_email && (
                            <p className="text-xs text-red-600 dark:text-red-400">{editFieldErrors.username_or_email}</p>
                          )}
                        </div>

                        {/* Password */}
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-content" htmlFor={`edit-password-${credential.id}`}>
                            Password
                          </label>
                          <input
                            id={`edit-password-${credential.id}`}
                            type="password"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
                            placeholder="Credential password"
                            required
                            maxLength={1024}
                          />
                          {editFieldErrors.password && (
                            <p className="text-xs text-red-600 dark:text-red-400">{editFieldErrors.password}</p>
                          )}
                        </div>

                        {/* Detail / Label */}
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-content" htmlFor={`edit-detail-${credential.id}`}>
                            Detail/Label
                          </label>
                          <input
                            id={`edit-detail-${credential.id}`}
                            type="text"
                            value={editDetail}
                            onChange={(e) => setEditDetail(e.target.value)}
                            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
                            placeholder="e.g. GitHub, Netflix, AWS"
                            required
                            maxLength={255}
                          />
                          {editFieldErrors.detail && (
                            <p className="text-xs text-red-600 dark:text-red-400">{editFieldErrors.detail}</p>
                          )}
                        </div>

                        {/* URL (optional) */}
                        <div className="space-y-1">
                          <label className="text-sm font-medium text-content" htmlFor={`edit-url-${credential.id}`}>
                            URL (optional)
                          </label>
                          <input
                            id={`edit-url-${credential.id}`}
                            type="url"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
                            placeholder="https://example.com"
                            maxLength={2048}
                          />
                          {editFieldErrors.url && (
                            <p className="text-xs text-red-600 dark:text-red-400">{editFieldErrors.url}</p>
                          )}
                        </div>

                        {/* Buttons */}
                        <div className="flex gap-2 pt-2">
                          <button type="submit" className="btn-primary text-sm" disabled={editLoading}>
                            {editLoading ? "Saving..." : "Save Changes"}
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

                    {/* Change Password Form */}
                    {changingPasswordId === credential.id && (
                      <form
                        className="mt-4 space-y-3 rounded-lg border border-border bg-surface-raised p-4"
                        onSubmit={(e) => handleChangePasswordSubmit(e, credential.id)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <h4 className="text-sm font-semibold text-content">Change Master Password</h4>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-content-muted" htmlFor={`cp-current-${credential.id}`}>
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
                            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
                            placeholder="Enter current master password"
                          />
                          {cpCurrentPasswordError && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{cpCurrentPasswordError}</p>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-medium text-content-muted" htmlFor={`cp-new-${credential.id}`}>
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
                            className="w-full rounded-xl border border-border bg-canvas px-3 py-2 text-sm text-content shadow-sm outline-none transition focus:border-brand-500"
                            placeholder="Enter new master password (min 8 characters)"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={cpLoading || cpCurrentPassword.length < 8 || cpNewPassword.length < 8}
                            className="btn-primary text-sm"
                          >
                            {cpLoading ? "Changing\u2026" : "Change Password"}
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
            ))}
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

      {/* Create Credential Modal */}
      <CreateCredentialModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          reload();
          setShowCreateModal(false);
        }}
      />

      {/* Master Password Modal */}
      <MasterPasswordModal
        action={pendingAction}
        onClose={() => setPendingAction(null)}
      />
    </div>
  );
}
