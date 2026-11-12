import "server-only";
import { fromDateInput } from "@/lib/domain/dates";
import { paymentSchema } from "@/lib/validation";
import { db } from "./db";
import { AppError, notFound } from "./errors";
import { areFriends } from "./friends";
import { parse } from "./parse";

/** Record that `fromUserId` paid `toUserId`. Partial amounts are fine; balances are derived. */
export async function recordPayment(userId: string, input: unknown) {
  const data = parse(paymentSchema, input);
  let currency: string;

  if (data.groupId) {
    const group = await db.group.findFirst({
      where: { id: data.groupId, members: { some: { userId } } },
      select: { currency: true, members: { select: { userId: true } } },
    });
    if (!group) throw notFound("group");
    const ids = new Set(group.members.map((m) => m.userId));
    if (!ids.has(data.fromUserId) || !ids.has(data.toUserId)) {
      throw new AppError("Both people must be members of this group.", "VALIDATION");
    }
    currency = group.currency;
  } else {
    const friendId = data.friendId!;
    const pair = new Set([userId, friendId]);
    if (!pair.has(data.fromUserId) || !pair.has(data.toUserId)) {
      throw new AppError("A payment with a friend must be between you and them.", "VALIDATION");
    }
    if (!(await areFriends(userId, friendId))) throw notFound("friend");
    const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { defaultCurrency: true } });
    currency = me.defaultCurrency;
  }

  return db.settlement.create({
    data: {
      groupId: data.groupId ?? null,
      fromUserId: data.fromUserId,
      toUserId: data.toUserId,
      amountCents: data.amountCents,
      currency,
      note: data.note || null,
      settledAt: data.date ? fromDateInput(data.date) : new Date(),
      createdById: userId,
    },
    select: { id: true, groupId: true },
  });
}

export async function deletePayment(userId: string, paymentId: string) {
  const p = await db.settlement.findUnique({
    where: { id: paymentId },
    select: { id: true, groupId: true, fromUserId: true, toUserId: true, group: { select: { members: { select: { userId: true } } } } },
  });
  if (!p) throw notFound("payment");
  const allowed = p.group ? p.group.members.some((m) => m.userId === userId) : p.fromUserId === userId || p.toUserId === userId;
  if (!allowed) throw notFound("payment");
  await db.settlement.delete({ where: { id: paymentId } });
  return { groupId: p.groupId, friendId: p.groupId ? undefined : p.fromUserId === userId ? p.toUserId : p.fromUserId };
}
