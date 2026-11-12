"use server";

import { addFriendByEmail, removeFriend } from "@/lib/server/friends";
import { authed } from "./run";

export async function addFriendAction(input: { email: string }) {
  return authed(async (user) => {
    const f = await addFriendByEmail(user.id, input);
    return { id: f.id, name: f.name };
  });
}

export async function removeFriendAction(friendId: string) {
  return authed(async (user) => {
    await removeFriend(user.id, friendId);
  });
}
