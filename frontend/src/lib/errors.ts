import { ApiError } from "../api/client";

/** Extract a user-facing message from any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) {
    // A bare TypeError from fetch usually means the backend is unreachable.
    if (err.name === "TypeError") {
      return "Could not reach the server. Is the ShortlyX API running?";
    }
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

/** The stable backend error code, if available (e.g. "alias_conflict"). */
export function errorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}
