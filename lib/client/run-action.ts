import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/server/errors";

/** The failed half of an ActionResult. */
export type ActionFailure = Extract<ActionResult<unknown>, { ok: false }>;

export const UNREACHABLE_ERROR = "Couldn't reach BillSplit. Check your connection and try again.";

/**
 * Calls a Server Action from a client form. Expected failures already come back as `{ ok: false }`;
 * this also turns a thrown call (offline, timeout, a deploy in progress) into one, so the form stays
 * open with what the person typed instead of falling through to the page's error boundary.
 * Next's own redirect/not-found signals are passed through untouched.
 */
export async function runAction<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch (error) {
    unstable_rethrow(error);
    console.error("[action] call failed", error);
    return { ok: false, error: UNREACHABLE_ERROR };
  }
}

/**
 * Splits a failed result into per-field messages and a form-level banner. Validation errors repeat the first
 * field message in `error`, so the banner shows only when no field explains it; keys in `ignore` (handled by the
 * form some other way, e.g. an expired reset `token`) don't count as explaining it. Errors without fieldErrors
 * (e.g. RATE_LIMITED lockouts) always come back as the form-level message.
 */
export function splitFailure(
  result: { ok: true } | ActionFailure | null | undefined,
  ignore: string[] = [],
): { fieldErrors: Record<string, string>; formError: string | null } {
  if (!result || result.ok) return { fieldErrors: {}, formError: null };
  const fieldErrors = result.fieldErrors ?? {};
  return { fieldErrors, formError: Object.keys(fieldErrors).some((k) => !ignore.includes(k)) ? null : result.error };
}
