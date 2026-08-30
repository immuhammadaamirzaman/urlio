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

/**
 * True for the rejection `fetch` produces when its `AbortSignal` fires. Callers use this
 * to tell "the caller cancelled" apart from a genuine failure worth reporting.
 */
export function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
}
