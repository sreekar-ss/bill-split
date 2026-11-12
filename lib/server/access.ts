import "server-only";
import { db } from "./db";
import { areFriends } from "./friends";

/**
 * Cheap "may this user open this page?" checks for the [id] route layouts. They run before the
 * page's loading boundary, so a page the user can't see answers with a real HTTP 404 instead of a
 * streamed 200. They mirror the rules in getGroup / getFriend / getExpense, which still enforce
 * access themselves; these only decide the status code early.
 */

export async function canViewGroup(userId: string, groupId: string): Promise<boolean> {
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { userId: true } });
  return Boolean(member);
}

export async function canViewFriend(userId: string, friendId: string): Promise<boolean> {
  if (userId === friendId) return false;
  const friend = await db.user.findUnique({ where: { id: friendId }, select: { id: true } });
  return Boolean(friend) && (await areFriends(userId, friendId));
}

export async function canViewExpense(userId: string, expenseId: string): Promise<boolean> {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    select: {
      groupId: true,
      group: { select: { members: { where: { userId }, select: { userId: true } } } },
      splits: { where: { userId }, select: { userId: true } },
    },
  });
  if (!expense) return false;
  return expense.groupId ? Boolean(expense.group?.members.length) : expense.splits.length > 0;
}
