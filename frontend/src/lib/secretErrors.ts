import { ApiError } from "../api/client";
import { errorMessage } from "./errors";

/** Share-specific wording for the codes the secrets pages can provoke; everything else
 *  falls through to the shared `errorMessage`, which already covers network and generic
 *  API failures. */
const SECRET_MESSAGES: Record<string, string> = {
  secret_already_consumed:
    "This secret has already been opened. Ask the sender to create a new one.",
  secret_expired: "This secret link has expired. Ask the sender to create a new one.",
  secret_not_found: "This secret link is not valid. Check that you copied the whole link.",
  secret_auth_required:
    "The sender restricted this secret to signed-in readers. Sign in, then open the link again — it has not been used up.",
  forbidden: "Please sign in again to create or open a secret share.",
  not_authenticated: "Please sign in again to create or open a secret share.",
};

export function getSecretErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const specific =
      SECRET_MESSAGES[error.code] ??
      (error.status === 403 ? SECRET_MESSAGES.forbidden : undefined);
    if (specific) return specific;
  }
  return errorMessage(error) || fallback;
}
