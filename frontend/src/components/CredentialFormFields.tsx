import { useId } from "react";

import type {
  CredentialFieldErrors,
  CredentialFieldValues,
} from "../lib/credentialFields";

interface FieldProps {
  id: string;
  label: string;
  type: "text" | "password" | "url";
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  /** Standing guidance shown under the label; unlike `error`, it is always visible. */
  hint?: string;
  required?: boolean;
  minLength?: number;
  maxLength: number;
  autoComplete: string;
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  hint,
  required = false,
  minLength,
  maxLength,
  autoComplete,
}: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  // Both messages describe the input, so name both — and in reading order, hint first.
  const describedBy =
    [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-amber-700 dark:text-amber-400">
          {hint}
        </p>
      )}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        autoComplete={autoComplete}
        className="input"
        // Ties the message to the field so screen readers announce it on focus,
        // instead of leaving it as loose text that only sighted users connect.
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {error && (
        <p id={errorId} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

interface CredentialFormFieldsProps {
  values: CredentialFieldValues;
  errors: CredentialFieldErrors;
  onChange: (patch: Partial<CredentialFieldValues>) => void;
}

/**
 * The credential field set, shared by the create modal and the inline edit form so the
 * two stay identical in labels, limits, and validation wiring.
 *
 * On `autoComplete`: the four lower fields are vault *contents*, not this site's
 * credentials, so they are marked `off` to keep the browser's password manager from
 * offering to save a stored row as a ShortlyX login — or autofilling a ShortlyX login
 * into a row being created. The master password is the user's own, so it stays
 * `current-password` and a manager may fill it, matching MasterPasswordModal.
 */
export function CredentialFormFields({
  values,
  errors,
  onChange,
}: CredentialFormFieldsProps) {
  const prefix = useId();

  return (
    <>
      <Field
        id={`${prefix}-master-password`}
        label="Master Password"
        type="password"
        autoComplete="current-password"
        value={values.masterPassword}
        onChange={(masterPassword) => onChange({ masterPassword })}
        placeholder="Enter your master password"
        error={errors.master_password}
        // The server keeps only the ciphertext, salt, and nonce — the password itself is
        // never stored, so a forgotten one leaves nobody able to recover the row. Say
        // that before the user commits a secret they can't get back.
        hint="Keep this safe — it is never stored. If you forget it, this credential can't be decrypted or recovered."
        required
        minLength={8}
        maxLength={128}
      />
      <Field
        id={`${prefix}-username`}
        label="Username or Email"
        type="text"
        value={values.usernameOrEmail}
        onChange={(usernameOrEmail) => onChange({ usernameOrEmail })}
        placeholder="user@example.com"
        error={errors.username_or_email}
        required
        maxLength={255}
        autoComplete="off"
      />
      <Field
        id={`${prefix}-password`}
        label="Password"
        type="password"
        value={values.password}
        onChange={(password) => onChange({ password })}
        placeholder="Credential password"
        error={errors.password}
        required
        maxLength={1024}
        autoComplete="off"
      />
      <Field
        id={`${prefix}-detail`}
        label="Detail/Label"
        type="text"
        value={values.detail}
        onChange={(detail) => onChange({ detail })}
        placeholder="e.g. GitHub, Netflix, AWS"
        error={errors.detail}
        required
        maxLength={255}
        autoComplete="off"
      />
      <Field
        id={`${prefix}-url`}
        label="URL (optional)"
        type="url"
        value={values.url}
        onChange={(url) => onChange({ url })}
        placeholder="https://example.com"
        error={errors.url}
        maxLength={2048}
        autoComplete="off"
      />
    </>
  );
}
