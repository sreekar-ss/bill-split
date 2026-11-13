import "server-only";
import { displayName } from "@/lib/utils/person";
import { appUrl } from "./app-url";
import { db } from "./db";
import { AppError } from "./errors";
import { ensureFriendship } from "./friends";
import { assertGroupAdmin, assertGroupMember, assertNotArchived } from "./groups";
import { sign, verifySignature } from "./tokens";

/**
 * Group invite links are stateless: /join/<groupId>.<HMAC(groupId:inviteVersion)>.
 * Resetting the link bumps inviteVersion, which invalidates every earlier link.
 */
const PURPOSE = "group-invite";

function tokenFor(group: { id: string; inviteVersion: number }) {
  return `${group.id}.${sign(PURPOSE, `${group.id}:${group.inviteVersion}`)}`;
}

async function resolve(token: string | undefined) {
  if (!token || token.length > 120) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const groupId = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const group = await db.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, inviteVersion: true, inviteEnabled: true, currency: true, archivedAt: true },
  });
  if (!group || !group.inviteEnabled) return null;
  if (!verifySignature(PURPOSE, `${group.id}:${group.inviteVersion}`, signature)) return null;
  return group;
}

export const INVALID_INVITE = "This invite link no longer works. Ask someone in the group for a new one.";
/** Shown to people who aren't in the group yet, so it points them at someone who can unarchive it. */
export const ARCHIVED_INVITE = "This group is archived. Ask someone in it to unarchive it first.";

/** The current link, for any member to share. */
export async function getInviteLink(userId: string, groupId: string) {
  await assertGroupMember(groupId, userId);
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId }, select: { id: true, inviteVersion: true, inviteEnabled: true } });
  return { url: `${appUrl()}/join/${tokenFor(group)}`, enabled: group.inviteEnabled };
}

/** Admins: invalidate the old link and issue a new one. */
export async function resetInviteLink(userId: string, groupId: string) {
  await assertGroupAdmin(groupId, userId, "Only the group's admin can reset the invite link.");
  await assertNotArchived(groupId);
  const updated = await db.group.update({
    where: { id: groupId },
    data: { inviteVersion: { increment: 1 }, inviteEnabled: true },
    select: { id: true, inviteVersion: true },
  });
  return { url: `${appUrl()}/join/${tokenFor(updated)}` };
}

/** What the /join page shows before someone joins. Null when the link is invalid. */
export async function getInvitePreview(token: string | undefined, viewerId?: string) {
  const group = await resolve(token);
  if (!group) return null;
  const members = await db.groupMember.findMany({
    where: { groupId: group.id },
    select: { userId: true, user: { select: { name: true, status: true } } },
    orderBy: { joinedAt: "asc" },
  });
  const shown = members.filter((m) => m.user.status !== "deleted");
  return {
    groupId: group.id,
    name: group.name,
    currency: group.currency,
    // Counted the same way as the names, so "and 2 others" always adds up.
    memberCount: shown.length,
    memberNames: shown.slice(0, 5).map((m) => displayName(m.user)),
    alreadyMember: viewerId ? members.some((m) => m.userId === viewerId) : false,
    /** Nobody can join while the group is archived. */
    archived: Boolean(group.archivedAt),
  };
}

/** Join via link. Idempotent for existing members. Makes the joiner friends with everyone in the group. */
export async function joinGroupByInvite(userId: string, token: string) {
  const group = await resolve(token);
  if (!group) throw new AppError(INVALID_INVITE, "NOT_FOUND");
  const members = await db.groupMember.findMany({ where: { groupId: group.id }, select: { userId: true } });
  if (members.some((m) => m.userId === userId)) return { groupId: group.id, joined: false };
  if (group.archivedAt) throw new AppError(ARCHIVED_INVITE, "CONFLICT");
  await db.$transaction(async (tx) => {
    await tx.groupMember.create({ data: { groupId: group.id, userId } });
    for (const m of members) await ensureFriendship(tx, userId, m.userId);
  });
  return { groupId: group.id, joined: true };
}
