// Client-side mirror of the backend's credential field constraints, shared by the create
// modal and the inline edit form so the two can't drift apart.

export interface CredentialFieldValues {
  masterPassword: string;
  usernameOrEmail: string;
  password: string;
  detail: string;
  url: string;
}

/** Keys match the `field` values the backend returns on a 422, so both can populate this. */
export type CredentialFieldErrors = Partial<
  Record<"master_password" | "username_or_email" | "password" | "detail" | "url", string>
>;

const CREDENTIAL_FIELDS = [
  "master_password",
  "username_or_email",
  "password",
  "detail",
  "url",
] as const;

/** Narrow an untrusted `ApiError.field` to a key of `CredentialFieldErrors`. */
export function isCredentialField(
  field: string | null,
): field is keyof CredentialFieldErrors {
  return field !== null && (CREDENTIAL_FIELDS as readonly string[]).includes(field);
}

export function validateCredentialFields(
  values: CredentialFieldValues,
): CredentialFieldErrors {
  const errors: CredentialFieldErrors = {};

  if (values.masterPassword.length < 8) {
    errors.master_password = "Master password must be at least 8 characters.";
  } else if (values.masterPassword.length > 128) {
    errors.master_password = "Master password must be at most 128 characters.";
  }

  if (values.usernameOrEmail.length < 1) {
    errors.username_or_email = "Username or email is required.";
  } else if (values.usernameOrEmail.length > 255) {
    errors.username_or_email = "Username or email must be at most 255 characters.";
  }

  if (values.password.length < 1) {
    errors.password = "Password is required.";
  } else if (values.password.length > 1024) {
    errors.password = "Password must be at most 1024 characters.";
  }

  if (values.detail.length < 1) {
    errors.detail = "Detail/label is required.";
  } else if (values.detail.length > 255) {
    errors.detail = "Detail/label must be at most 255 characters.";
  }

  if (values.url.length > 2048) {
    errors.url = "URL must be at most 2048 characters.";
  }

  return errors;
}
