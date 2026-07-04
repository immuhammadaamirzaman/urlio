import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { resendVerification } from "../api/auth";
import { tokenStore } from "../api/tokenStore";
import type { SessionRead } from "../api/types";
import {
  deleteAccount,
  listSessions,
  requestEmailChange,
  revokeSession,
  updateMe,
} from "../api/users";
import { Modal } from "../components/Modal";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { errorMessage } from "../lib/errors";
import { formatDate, timeAgo } from "../lib/format";
import { jwtJti } from "../lib/jwt";

export function SettingsPage() {
  const { user, setUser, login, logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [resending, setResending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);
  const [revokingJti, setRevokingJti] = useState<string | null>(null);

  const sessions = useAsyncData<SessionRead[]>(() => listSessions(), []);
  const currentJti = jwtJti(tokenStore.getRefresh());

  if (!user) return null;
  const email = user.email;

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const updated = await updateMe({ display_name: displayName.trim() || null });
      setUser(updated);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      await updateMe({ password, current_password: currentPassword });
      // The backend revoked every session; sign back in with the new password so
      // this device keeps working. Other devices are signed out.
      try {
        await login({ email, password });
        toast.success("Password changed. Other devices were signed out.");
      } catch {
        toast.success("Password changed. Please sign in again.");
        navigate("/login");
        return;
      }
      setPassword("");
      setCurrentPassword("");
      sessions.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    setSavingEmail(true);
    try {
      await requestEmailChange(newEmail.trim(), emailPassword);
      toast.success(`Confirmation link sent to ${newEmail.trim()}.`);
      setNewEmail("");
      setEmailPassword("");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleResendVerification() {
    setResending(true);
    try {
      await resendVerification();
      toast.success("Verification email sent. Check your inbox.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setResending(false);
    }
  }

  async function handleRevokeSession(jti: string) {
    setRevokingJti(jti);
    try {
      await revokeSession(jti);
      sessions.setData((prev) => (prev ? prev.filter((s) => s.jti !== jti) : prev));
      toast.success("Session signed out.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRevokingJti(null);
    }
  }

  async function handleLogoutAll() {
    setLoggingOutAll(true);
    try {
      await logoutAll();
      toast.success("Signed out of all devices.");
      navigate("/login");
    } catch (err) {
      toast.error(errorMessage(err));
      setLoggingOutAll(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      tokenStore.clear();
      toast.success("Your account has been deleted.");
      navigate("/");
    } catch (err) {
      toast.error(errorMessage(err));
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      {/* Account */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Account</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Email</dt>
            <dd className="flex items-center gap-2 font-medium text-slate-800">
              <span className="truncate">{user.email}</span>
              {user.email_verified ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  Verified
                </span>
              ) : (
                <>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Unverified
                  </span>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                  >
                    {resending ? "Sending…" : "Resend link"}
                  </button>
                </>
              )}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-medium text-slate-800">{formatDate(user.created_at)}</dd>
          </div>
        </dl>

        <form onSubmit={handleEmailChange} className="mt-5 space-y-4 border-t border-slate-100 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Change email</h3>
          <div>
            <label className="label" htmlFor="new_email">
              New email
            </label>
            <input
              id="new_email"
              type="email"
              autoComplete="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="email_password">
              Current password
            </label>
            <input
              id="email_password"
              type="password"
              autoComplete="current-password"
              required
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500">
              We&apos;ll email a confirmation link to the new address; nothing changes
              until it&apos;s confirmed.
            </p>
          </div>
          <button type="submit" disabled={savingEmail} className="btn-primary">
            {savingEmail ? <Spinner className="h-4 w-4" /> : null}
            Send confirmation
          </button>
        </form>
      </section>

      {/* Profile */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Profile</h2>
        <form onSubmit={handleProfileSave} className="mt-3 space-y-4">
          <div>
            <label className="label" htmlFor="display_name">
              Display name
            </label>
            <input
              id="display_name"
              type="text"
              maxLength={100}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input"
              placeholder="Your name"
            />
          </div>
          <button type="submit" disabled={savingProfile} className="btn-primary">
            {savingProfile ? <Spinner className="h-4 w-4" /> : null}
            Save profile
          </button>
        </form>
      </section>

      {/* Password */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Change password</h2>
        <form onSubmit={handlePasswordSave} className="mt-3 space-y-4">
          <div>
            <label className="label" htmlFor="current_password">
              Current password
            </label>
            <input
              id="current_password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label" htmlFor="new_password">
              New password
            </label>
            <input
              id="new_password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500">
              At least 8 characters. Changing your password signs out every other device.
            </p>
          </div>
          <button type="submit" disabled={savingPassword} className="btn-primary">
            {savingPassword ? <Spinner className="h-4 w-4" /> : null}
            Change password
          </button>
        </form>
      </section>

      {/* Sessions */}
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Active sessions</h2>
          <button
            type="button"
            onClick={handleLogoutAll}
            disabled={loggingOutAll}
            className="btn-danger text-sm"
          >
            {loggingOutAll ? <Spinner className="h-4 w-4" /> : null}
            Sign out everywhere
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Devices holding a valid sign-in for your account.
        </p>
        {sessions.loading && !sessions.data ? (
          <div className="flex h-16 items-center justify-center">
            <Spinner className="h-5 w-5 text-brand-600" />
          </div>
        ) : sessions.error ? (
          <p className="mt-3 text-sm text-red-600">{sessions.error}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {(sessions.data ?? []).map((s) => {
              const isCurrent = s.jti === currentJti;
              return (
                <li key={s.jti} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p
                      className="truncate text-sm font-medium text-slate-800"
                      title={s.user_agent ?? undefined}
                    >
                      {s.user_agent ?? "Unknown device"}
                      {isCurrent && (
                        <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-slate-500">
                      {s.created_at ? `Signed in ${formatDate(s.created_at)}` : "Signed in —"}
                      {s.refreshed_at ? ` · active ${timeAgo(s.refreshed_at)}` : ""}
                    </p>
                  </div>
                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => handleRevokeSession(s.jti)}
                      disabled={revokingJti === s.jti}
                      className="btn-secondary text-xs"
                    >
                      {revokingJti === s.jti ? <Spinner className="h-3 w-3" /> : null}
                      Sign out
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Danger zone */}
      <section className="card border-red-200 p-5">
        <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
        <p className="mt-1 text-sm text-slate-500">
          Deleting your account permanently removes your profile, every short link you
          own, and all click history. This cannot be undone.
        </p>
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="btn-danger mt-3"
        >
          Delete account
        </button>
      </section>

      <Modal
        open={confirmingDelete}
        title="Delete your account?"
        onClose={() => {
          if (!deleting) {
            setConfirmingDelete(false);
            setDeletePassword("");
          }
        }}
      >
        <form onSubmit={handleDeleteAccount} className="space-y-4">
          <p className="text-sm text-slate-600">
            This permanently deletes <strong>{user.email}</strong>, all of your short
            links, and their analytics. Enter your password to confirm.
          </p>
          <div>
            <label className="label" htmlFor="delete_password">
              Password
            </label>
            <input
              id="delete_password"
              type="password"
              autoComplete="current-password"
              required
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              className="input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={deleting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={deleting} className="btn-danger">
              {deleting ? <Spinner className="h-4 w-4" /> : null}
              Delete forever
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
