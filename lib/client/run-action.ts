import { unstable_rethrow } from "next/navigation";
import type { ActionResult } from "@/lib/server/errors";

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
