import { ApiError } from "../api/http";

/** A user-facing message for an API failure (never a stack trace; correlation id for support). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0 || err.code === "HTTP_0") return "The service could not be reached. Check your connection and try again.";
    if (err.status === 429) return "Too many attempts. Please wait a moment and try again.";
    if (err.status >= 500) return "Something went wrong on our side. Please try again.";
    return err.detail ?? err.message;
  }
  if (err instanceof TypeError) return "The service could not be reached. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}
