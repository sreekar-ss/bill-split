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
