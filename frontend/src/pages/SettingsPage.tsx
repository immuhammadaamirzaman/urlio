import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { updateMe } from "../api/users";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Spinner } from "../components/Spinner";
import { errorMessage } from "../lib/errors";
import { formatDate } from "../lib/format";

export function SettingsPage() {
  const { user, setUser, logoutAll } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [password, setPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loggingOutAll, setLoggingOutAll] = useState(false);

  if (!user) return null;

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
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      await updateMe({ password });
      setPassword("");
      toast.success("Password changed.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingPassword(false);
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      {/* Account */}
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Account</h2>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500">Email</dt>
            <dd className="font-medium text-slate-800">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">Member since</dt>
            <dd className="font-medium text-slate-800">{formatDate(user.created_at)}</dd>
          </div>
        </dl>
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
            <label className="label" htmlFor="new_password">
              New password
            </label>
            <input
              id="new_password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
            <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
          </div>
          <button type="submit" disabled={savingPassword} className="btn-primary">
            {savingPassword ? <Spinner className="h-4 w-4" /> : null}
            Change password
          </button>
        </form>
      </section>

      {/* Sessions */}
      <section className="card border-red-100 p-5">
        <h2 className="text-base font-semibold text-slate-900">Sessions</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sign out everywhere by revoking all refresh tokens. You&apos;ll need to sign in
          again on every device.
        </p>
        <button
          type="button"
          onClick={handleLogoutAll}
          disabled={loggingOutAll}
          className="btn-danger mt-3"
        >
          {loggingOutAll ? <Spinner className="h-4 w-4" /> : null}
          Sign out of all devices
        </button>
      </section>
    </div>
  );
}
