import { api } from "./client";

export interface SecretCreateRequest {
  secret: string;
  expires_in_seconds: number;
  /** Refuse to open for anonymous readers; they are asked to sign in instead. */
  require_auth: boolean;
}

export interface SecretShareResponse {
  token: string;
  expires_at: string;
  require_auth: boolean;
}

export interface SecretOpenResponse {
  secret: string;
  expires_at: string;
}

export interface SecretPreviewResponse {
  consumed: boolean;
  expires_at: string;
  /**
   * Whether the sender restricted this share to signed-in readers. Known from the
   * non-consuming preview on purpose: the reveal is single-use, so the reader has to be
   * sent to sign in *before* spending it.
   */
  require_auth: boolean;
}

export function createSecretShare(data: SecretCreateRequest): Promise<SecretShareResponse> {
  return api.post<SecretShareResponse>("/secrets", data);
}

/**
 * Non-consuming metadata lookup. Safe to call on page load, on refresh, or from link
 * unfurlers — it never burns the share and never returns the secret itself.
 */
export function previewSecretShare(
  token: string,
  signal?: AbortSignal,
): Promise<SecretPreviewResponse> {
  return api.get<SecretPreviewResponse>(
    `/secrets/${encodeURIComponent(token)}`,
    undefined,
    signal,
  );
}

/**
 * Opens and CONSUMES the share (`?reveal=true`). Call this exactly once, and only from an
 * explicit user action — a second call returns 409 `secret_already_consumed`.
 *
 * Deliberately takes no AbortSignal: aborting on the client would not un-consume the share
 * server-side, so the secret would be lost.
 */
export function openSecretShare(token: string): Promise<SecretOpenResponse> {
  return api.get<SecretOpenResponse>(`/secrets/${encodeURIComponent(token)}`, {
    reveal: true,
  });
}
