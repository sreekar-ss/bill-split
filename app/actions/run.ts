import "server-only";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { AppError, type ActionResult } from "@/lib/server/errors";

/**
 * Wraps a Server Action body: requires a signed-in user, maps AppErrors to `{ ok: false }`,
 * revalidates the app after a successful mutation, and never leaks unexpected errors.
 */
export async function authed<T>(fn: (user: CurrentUser) => Promise<T>): Promise<ActionResult<T>> {
  const user = await requireUser();
  return guard(async () => {
    const data = await fn(user);
    revalidatePath("/", "layout");
    return data;
  });
}

export async function guard<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AppError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
    console.error("[action] unexpected error", error);
    return { ok: false, error: "Something went wrong on our side. Try again in a moment." };
  }
}
