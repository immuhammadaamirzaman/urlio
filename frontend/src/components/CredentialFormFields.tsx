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
  required?: boolean;
  minLength?: number;
  maxLength: number;
}

function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  error,
  required = false,
  minLength,
  maxLength,
}: FieldProps) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        className="input"
        // Ties the message to the field so screen readers announce it on focus,
        // instead of leaving it as loose text that only sighted users connect.
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
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
        value={values.masterPassword}
        onChange={(masterPassword) => onChange({ masterPassword })}
        placeholder="Enter your master password"
        error={errors.master_password}
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
      />
    </>
  );
}
