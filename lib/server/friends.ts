import "server-only";
import { pairStakeInExpense } from "@/lib/domain/ledger";
import { db, type Tx } from "./db";
import { AppError, notFound } from "./errors";
import { computeRelations, directNets } from "./ledger";
import { sendClaimInvite } from "./email-tokens";
import { HIDDEN_HANDLES, sharesHandlesWith } from "./handle-sharing";
import { findOrCreateInvitee } from "./invitees";

const userSummary = { id: true, name: true, email: true, status: true } as const;

function friendshipWhere(a: string, b: string) {
  return {
    OR: [
      { userId: a, friendId: b },
      { userId: b, friendId: a },
    ],
  };
}

export async function areFriends(a: string, b: string, client: Tx | typeof db = db) {
  const f = await client.friendship.findFirst({ where: { ...friendshipWhere(a, b), status: "accepted" }, select: { id: true } });
  return Boolean(f);
}

/** Idempotently mark two users as friends (MVP1: no request/accept step). */
export async function ensureFriendship(client: Tx | typeof db, a: string, b: string) {
  if (a === b) return;
  const existing = await client.friendship.findFirst({ where: friendshipWhere(a, b) });
  if (existing) {
    if (existing.status !== "accepted") {
      await client.friendship.update({ where: { id: existing.id }, data: { status: "accepted", acceptedAt: new Date() } });
    }
    return;
  }
  await client.friendship.create({ data: { userId: a, friendId: b, status: "accepted", acceptedAt: new Date() } });
}

export async function listFriends(userId: string) {
  const [friendships, relations] = await Promise.all([
    db.friendship.findMany({
      where: { status: "accepted", OR: [{ userId }, { friendId: userId }] },
      select: { user: { select: userSummary }, friend: { select: userSummary } },
    }),
    computeRelations(userId),
  ]);
  const people = new Map<string, { id: string; name: string; email: string; status: string }>();
  for (const f of friendships) {
    const other = f.user.id === userId ? f.friend : f.user;
    people.set(other.id, other);
  }
  return [...people.values()]
    .map((p) => ({ ...p, balances: relations.get(p.id)?.totals ?? [] }))
    .sort((a, b) => Math.abs(b.balances[0]?.cents ?? 0) - Math.abs(a.balances[0]?.cents ?? 0) || a.name.localeCompare(b.name));
}

export async function addFriendByEmail(userId: string, input: unknown) {
  const { user: friend } = await findOrCreateInvitee(db, input, userId);
  if (friend.id === userId) throw new AppError("That's your own email.", "VALIDATION", { email: "That's your own email." });
  if (await areFriends(userId, friend.id)) {
    throw new AppError(`You and ${friend.name} are already friends.`, "CONFLICT", { email: "Already a friend." });
  }
  await ensureFriendship(db, userId, friend.id);
  if (friend.status === "placeholder") {
    const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } });
    await sendClaimInvite(friend.id, `${me.name} wants to split expenses with you`);
  }
  return { id: friend.id, name: friend.name, invited: friend.status === "placeholder" };
}

export async function getFriend(userId: string, friendId: string) {
  const friend = await db.user.findUnique({
    where: { id: friendId },
    select: { ...userSummary, venmoHandle: true, paypalMe: true, cashTag: true, upiId: true },
  });
  if (!friend || !(await areFriends(userId, friendId))) throw notFound("friend");

  const both = { AND: [{ splits: { some: { userId } } }, { splits: { some: { userId: friendId } } }] };
  const [relations, expenses, payments] = await Promise.all([
    computeRelations(userId),
    db.expense.findMany({
      where: {
        OR: [
          { groupId: null, ...both },
          // Group expenses where one paid and the other had a share.
          { groupId: { not: null }, paidById: userId, splits: { some: { userId: friendId, amountCents: { gt: 0 } } } },
          { groupId: { not: null }, paidById: friendId, splits: { some: { userId, amountCents: { gt: 0 } } } },
        ],
      },
      select: {
        id: true,
        description: true,
        amountCents: true,
        currency: true,
        category: true,
        date: true,
        createdAt: true,
        paidById: true,
        paidBy: { select: userSummary },
        group: { select: { id: true, name: true } },
        splits: { select: { userId: true, amountCents: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.settlement.findMany({
      where: {
        OR: [
          { fromUserId: userId, toUserId: friendId },
          { fromUserId: friendId, toUserId: userId },
        ],
      },
      select: {
        id: true,
        amountCents: true,
        currency: true,
        settledAt: true,
        createdAt: true,
        note: true,
        fromUser: { select: userSummary },
        toUser: { select: userSummary },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);
  const relation = relations.get(friendId);

  return {
    friend: (await sharesHandlesWith(friendId, userId)) ? friend : { ...friend, ...HIDDEN_HANDLES },
    /** Per-currency totals with this friend, non-zero only (empty = settled up). */
    balances: relation?.totals ?? [],
    breakdown: relation?.byContext ?? [],
    expenses: expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      currency: e.currency,
      category: e.category,
      date: e.date,
      createdAt: e.createdAt,
      paidBy: e.paidBy,
      group: e.group,
      // Only the part of the expense that's between the two of you, not your stake in the whole group expense.
      myStakeCents: pairStakeInExpense(userId, friendId, { paidById: e.paidById, amountCents: e.amountCents, shares: e.splits }, e.group !== null),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      currency: p.currency,
      date: p.settledAt,
      createdAt: p.createdAt,
      note: p.note,
      from: p.fromUser,
      to: p.toUser,
      group: p.group,
    })),
  };
}
export type FriendDetail = Awaited<ReturnType<typeof getFriend>>;

/** Remove a friend. Only allowed when nothing is owed directly between you (group balances are unaffected). */
export async function removeFriend(userId: string, friendId: string) {
  if (!(await areFriends(userId, friendId))) throw notFound("friend");
  if ((await directNets(userId, friendId)).length > 0) {
    throw new AppError("Settle up your direct balance before removing this friend.", "CONFLICT");
  }
  await db.friendship.deleteMany({ where: friendshipWhere(userId, friendId) });
}
