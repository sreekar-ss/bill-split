"use server";

import { redirect } from "next/navigation";
import { endSession, startSession } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/server/errors";
import { requestPasswordReset, resetPassword } from "@/lib/server/password-reset";
import { authenticate, registerUser } from "@/lib/server/users";
import { guard } from "./run";

/** Only allow same-site relative redirects after login. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  // "//host" and "/\\host" are protocol-relative in browsers; control characters can smuggle either.
  const safe = next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !/[\u0000-\u001f\\]/.test(next);
  return safe ? next : "/home";
}

export type AuthFormState = ActionResult<undefined> | null;

export async function registerAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const result = await guard(async () => {
    const user = await registerUser({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
    await startSession(user);
  });
  if (!result.ok) return result;
  redirect(safeNext(form.get("next")));
}

export async function loginAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const result = await guard(async () => {
    const user = await authenticate({ email: form.get("email"), password: form.get("password") });
    await startSession(user);
  });
  if (!result.ok) return result;
  redirect(safeNext(form.get("next")));
}

/** Always reports success for a valid email (no account enumeration). */
export async function forgotPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  return guard(async () => {
    await requestPasswordReset({ email: form.get("email") });
    return undefined;
  });
}

/** Sets the new password, then signs this browser in (all other sessions were revoked). */
export async function resetPasswordAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const result = await guard(async () => {
    const user = await resetPassword({ token: form.get("token"), password: form.get("password") });
    await startSession(user);
  });
  if (!result.ok) return result;
  redirect("/home?reset=1");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
