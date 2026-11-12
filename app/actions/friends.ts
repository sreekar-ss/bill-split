"use server";

import { addFriendByEmail, removeFriend } from "@/lib/server/friends";
import { authed } from "./run";

/**
 * Add a friend by email, or invite them when the email has no account yet. Without `name` an
 * unknown email fails with fieldErrors.name, which the sheet uses to ask for it.
 */
export async function addFriendAction(input: { email: string; name?: string }) {
  return authed(async (user) => {
    const f = await addFriendByEmail(user.id, input);
    return { id: f.id, name: f.name, invited: f.invited };
  });
}

export async function removeFriendAction(friendId: string) {
  return authed(async (user) => {
    await removeFriend(user.id, friendId);
  });
}
