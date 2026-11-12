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

export async function addMemberAction(groupId: string, input: { email: string }) {
  return authed(async (user) => {
    const added = await addMemberByEmail(user.id, groupId, input);
    return { name: added.name };
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
