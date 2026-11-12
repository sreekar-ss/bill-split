"use server";

import { getInviteLink, joinGroupByInvite, resetInviteLink } from "@/lib/server/invites";
import { authed } from "./run";

export async function getInviteLinkAction(groupId: string) {
  return authed((user) => getInviteLink(user.id, groupId));
}

export async function resetInviteLinkAction(groupId: string) {
  return authed((user) => resetInviteLink(user.id, groupId));
}

/** Join from /join/<token>; returns the group id to navigate to. */
export async function joinGroupAction(token: string) {
  return authed((user) => joinGroupByInvite(user.id, token));
}
