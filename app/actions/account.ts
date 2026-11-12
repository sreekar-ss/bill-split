"use server";

import { startSession } from "@/lib/auth/session";
import { changePassword, updateProfile } from "@/lib/server/users";
import { authed } from "./run";

export async function updateProfileAction(input: { name: string; defaultCurrency: string }) {
  return authed(async (user) => {
    await updateProfile(user.id, input);
  });
}

/** Signs out every other session, then re-issues this browser's session. */
export async function changePasswordAction(input: { currentPassword: string; newPassword: string }) {
  return authed(async (user) => {
    const updated = await changePassword(user.id, input);
    await startSession(updated);
  });
}

import { redirect } from "next/navigation";
import { endSession } from "@/lib/auth/session";
import { deleteAccount, logoutEverywhere, updatePaymentHandles } from "@/lib/server/account";
import { sendVerificationEmail } from "@/lib/server/email-tokens";

export async function updatePaymentHandlesAction(input: { venmoHandle?: string; paypalMe?: string; cashTag?: string; upiId?: string }) {
  return authed(async (user) => {
    await updatePaymentHandles(user.id, input);
  });
}

/** Re-sends the verification link. `data.sent` is false when throttled (try again in a minute). */
export async function resendVerificationAction() {
  return authed(async (user) => ({ sent: await sendVerificationEmail(user.id) }));
}

/** Signs out every device including this one. */
export async function logoutEverywhereAction() {
  const result = await authed(async (user) => {
    await logoutEverywhere(user.id);
  });
  if (!result.ok) return result;
  await endSession();
  redirect("/login");
}

export async function deleteAccountAction(input: { password: string }) {
  const result = await authed(async (user) => {
    await deleteAccount(user.id, input);
  });
  if (!result.ok) return result;
  await endSession();
  redirect("/?deleted=1");
}
