export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED";

/** An expected, user-presentable failure. `message` is shown to the user verbatim. */
export class AppError extends Error {
  constructor(
    message: string,
    public code: AppErrorCode = "VALIDATION",
    public fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(`That ${what} doesn't exist or you don't have access to it.`, "NOT_FOUND");
export const forbidden = (message = "You don't have access to that.") => new AppError(message, "FORBIDDEN");

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
