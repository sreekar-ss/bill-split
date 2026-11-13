import "server-only";
import { z } from "zod";
import { displayName } from "@/lib/utils/person";
import { canViewExpense } from "./access";
import { db } from "./db";
import { AppError, notFound } from "./errors";
import { assertNotArchived } from "./groups";
import { parse } from "./parse";
import { sendPushToUser } from "./push";
import { hit } from "./rate-limit";

/** Short discussion threads on an expense ("was this Tuesday's dinner?"). Push-notified, never emailed. */

const commentSchema = z.object({
  text: z.string().trim().min(1, "Write a comment first.").max(500, "Keep comments under 500 characters."),
});

const COMMENTS_PER_MINUTE = 20;

export async function listComments(userId: string, expenseId: string) {
  if (!(await canViewExpense(userId, expenseId))) throw notFound("expense");
  const rows = await db.comment.findMany({
    where: { expenseId },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: { id: true, text: true, createdAt: true, user: { select: { id: true, name: true, status: true } } },
  });
  return rows.map((c) => ({ id: c.id, text: c.text, createdAt: c.createdAt, author: c.user, mine: c.user.id === userId }));
}
export type CommentItem = Awaited<ReturnType<typeof listComments>>[number];

export async function addComment(userId: string, expenseId: string, input: unknown) {
  const { text } = parse(commentSchema, input);
  if (!(await canViewExpense(userId, expenseId))) throw notFound("expense");
  const expense = await db.expense.findUniqueOrThrow({ where: { id: expenseId }, select: { groupId: true } });
  if (expense.groupId) await assertNotArchived(expense.groupId);
  const { count } = await hit(`comment:${userId}`, 60_000);
  if (count > COMMENTS_PER_MINUTE) throw new AppError("You're commenting very fast. Wait a minute and try again.", "RATE_LIMITED");
  return db.comment.create({ data: { expenseId, userId, text }, select: { id: true } });
}

/** Authors can delete their own comments. */
export async function deleteComment(userId: string, commentId: string) {
  const c = await db.comment.findUnique({ where: { id: commentId }, select: { userId: true, expenseId: true, expense: { select: { groupId: true } } } });
  if (!c || !(await canViewExpense(userId, c.expenseId))) throw notFound("comment");
  if (c.userId !== userId) throw new AppError("You can only delete your own comments.", "FORBIDDEN");
  if (c.expense.groupId) await assertNotArchived(c.expense.groupId);
  await db.comment.delete({ where: { id: commentId } });
  return { expenseId: c.expenseId };
}

/**
 * Push the people on the expense (payer and anyone with a share), except the author. Uses the
 * "expenses" preference. Never throws.
 */
export async function notifyCommentAdded(commentId: string) {
  try {
    const c = await db.comment.findUnique({
      where: { id: commentId },
      select: {
        text: true,
        userId: true,
        user: { select: { name: true, status: true } },
        expense: { select: { id: true, description: true, groupId: true, paidById: true, splits: { select: { userId: true, amountCents: true } } } },
      },
    });
    if (!c) return;
    const ids = new Set([c.expense.paidById, ...c.expense.splits.filter((s) => s.amountCents > 0).map((s) => s.userId)]);
    ids.delete(c.userId);
    // Only people who can still open the expense: someone who left or was removed from the group
    // keeps their old split rows but must not receive the comment text.
    const groupId = c.expense.groupId;
    const recipients = await db.user.findMany({
      where: {
        id: { in: [...ids] },
        status: "active",
        notifyExpenses: true,
        ...(groupId ? { groupMemberships: { some: { groupId } } } : {}),
      },
      select: { id: true },
    });
    const body = c.text.length > 120 ? `${c.text.slice(0, 117)}…` : c.text;
    await Promise.all(
      recipients.map((r) =>
        sendPushToUser(r.id, {
          title: `${displayName(c.user)} commented on ${c.expense.description}`,
          body,
          url: `/expenses/${c.expense.id}#comments`,
          tag: `comments-${c.expense.id}`,
        }),
      ),
    );
  } catch (error) {
    console.error("[comments] notify failed", error);
  }
}
