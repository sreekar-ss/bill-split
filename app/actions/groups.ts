"use server";

import { addMemberByEmail, createGroup, deleteGroup, removeMember, updateGroup } from "@/lib/server/groups";
import { authed } from "./run";

export async function createGroupAction(input: { name: string; currency?: string }) {
  return authed(async (user) => {
    const g = await createGroup(user.id, input);
    return { id: g.id };
  });
}

export async function updateGroupAction(groupId: string, input: { name: string; currency?: string }) {
  return authed(async (user) => {
    await updateGroup(user.id, groupId, input);
  });
}

/**
 * Add someone to a group by email. When nobody has an account with that email the service needs
 * `name` (VALIDATION with fieldErrors.name), then creates an invited placeholder and emails them.
 */
export async function addMemberAction(groupId: string, input: { email: string; name?: string }) {
  return authed(async (user) => {
    const added = await addMemberByEmail(user.id, groupId, input);
    return { id: added.id, name: added.name, invited: added.invited };
  });
}

export async function removeMemberAction(groupId: string, memberId: string) {
  return authed((user) => removeMember(user.id, groupId, memberId));
}

export async function deleteGroupAction(groupId: string) {
  return authed(async (user) => {
    await deleteGroup(user.id, groupId);
  });
}
