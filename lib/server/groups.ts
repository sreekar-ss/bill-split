import "server-only";
import { computeNets, simplifyDebts, stakeInExpense } from "@/lib/domain/ledger";
import { groupSchema } from "@/lib/validation";
import { db } from "./db";
import { AppError, forbidden, notFound } from "./errors";
import { sendClaimInvite } from "./email-tokens";
import { ensureFriendship } from "./friends";
import { HIDDEN_HANDLES, membersSharingHandles } from "./handle-sharing";
import { findOrCreateInvitee } from "./invitees";
import { loadGroupLedger } from "./ledger";
import { parse } from "./parse";

const userSummary = { id: true, name: true, email: true, status: true } as const;
/** For settle-up payment links; only passed on to viewers the owner has dealt with (see handle-sharing.ts). */
const paymentHandles = { venmoHandle: true, paypalMe: true, cashTag: true, upiId: true } as const;

export async function assertGroupMember(groupId: string, userId: string) {
  const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } }, select: { role: true } });
  if (!member) throw notFound("group");
  return member;
}

export async function listGroups(userId: string) {
  const memberships = await db.groupMember.findMany({
    where: { userId },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          currency: true,
          updatedAt: true,
          _count: { select: { members: true } },
          members: { select: { user: { select: { id: true, name: true, status: true } } }, orderBy: { joinedAt: "asc" }, take: 5 },
          expenses: { select: { paidById: true, amountCents: true, createdAt: true, splits: { select: { userId: true, amountCents: true } } } },
          settlements: { select: { fromUserId: true, toUserId: true, amountCents: true, createdAt: true } },
        },
      },
    },
  });

  return memberships
    .map(({ group }) => {
      const nets = computeNets(
        group.expenses.map((e) => ({ paidById: e.paidById, amountCents: e.amountCents, shares: e.splits })),
        group.settlements,
      );
      const lastActivityAt = [group.updatedAt, ...group.expenses.map((e) => e.createdAt), ...group.settlements.map((s) => s.createdAt)]
        .reduce((a, b) => (b > a ? b : a));
      return {
        id: group.id,
        name: group.name,
        currency: group.currency,
        memberCount: group._count.members,
        memberPreview: group.members.map((m) => m.user),
        myNetCents: nets.get(userId) ?? 0,
        lastActivityAt,
      };
    })
    .sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
}

export async function createGroup(userId: string, input: unknown) {
  const data = parse(groupSchema, input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { defaultCurrency: true } });
  return db.group.create({
    data: {
      name: data.name,
      currency: data.currency ?? user.defaultCurrency,
      createdById: userId,
      members: { create: { userId, role: "admin" } },
    },
    select: { id: true, name: true, currency: true },
  });
}

export async function getGroup(userId: string, groupId: string) {
  await assertGroupMember(groupId, userId);
  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      currency: true,
      createdById: true,
      createdAt: true,
      members: { select: { role: true, joinedAt: true, user: { select: { ...userSummary, ...paymentHandles } } }, orderBy: { joinedAt: "asc" } },
      expenses: {
        select: {
          id: true,
          description: true,
          amountCents: true,
          category: true,
          date: true,
          createdAt: true,
          splitMethod: true,
          paidBy: { select: userSummary },
          paidById: true,
          splits: { select: { userId: true, amountCents: true } },
        },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      },
      settlements: {
        select: {
          id: true,
          amountCents: true,
          settledAt: true,
          createdAt: true,
          note: true,
          fromUser: { select: userSummary },
          toUser: { select: userSummary },
        },
        orderBy: [{ settledAt: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  const memberIds = group.members.map((m) => m.user.id);
  const sharing = await membersSharingHandles(groupId, userId, memberIds);
  const nets = computeNets(
    group.expenses.map((e) => ({ paidById: e.paidById, amountCents: e.amountCents, shares: e.splits })),
    group.settlements.map((s) => ({ fromUserId: s.fromUser.id, toUserId: s.toUser.id, amountCents: s.amountCents })),
    memberIds,
  );
  const plan = simplifyDebts(nets);

  // People who left the group but still appear in history.
  type Person = { id: string; name: string; email: string; status: string };
  const known = new Map<string, Person>(
    group.members.map((m) => [m.user.id, { id: m.user.id, name: m.user.name, email: m.user.email, status: m.user.status }]),
  );
  const missing = [...nets.keys()].filter((id) => !known.has(id));
  if (missing.length) {
    for (const u of await db.user.findMany({ where: { id: { in: missing } }, select: userSummary })) known.set(u.id, u);
  }
  const person = (id: string): Person => known.get(id) ?? { id, name: "Former member", email: "", status: "deleted" };

  return {
    id: group.id,
    name: group.name,
    currency: group.currency,
    createdById: group.createdById,
    isAdmin: group.members.some((m) => m.user.id === userId && m.role === "admin") || group.createdById === userId,
    /** The currency is fixed once anything has been recorded in it. */
    currencyLocked: group.expenses.length + group.settlements.length > 0,
    /** Everyone's balance is zero (deleting is only allowed then). */
    settled: [...nets.values()].every((cents) => cents === 0),
    members: group.members.map((m) => ({
      ...m.user,
      ...(sharing.has(m.user.id) ? {} : HIDDEN_HANDLES),
      role: m.role,
      netCents: nets.get(m.user.id) ?? 0,
    })),
    myNetCents: nets.get(userId) ?? 0,
    plan: plan.map((t) => ({ from: person(t.fromUserId), to: person(t.toUserId), amountCents: t.amountCents })),
    expenses: group.expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      category: e.category,
      date: e.date,
      createdAt: e.createdAt,
      splitMethod: e.splitMethod,
      paidBy: e.paidBy,
      participantCount: e.splits.filter((s) => s.amountCents > 0).length,
      myStakeCents: stakeInExpense(userId, { paidById: e.paidById, amountCents: e.amountCents, shares: e.splits }),
      involvesMe: e.paidById === userId || e.splits.some((s) => s.userId === userId && s.amountCents > 0),
    })),
    payments: group.settlements.map((s) => ({
      id: s.id,
      amountCents: s.amountCents,
      date: s.settledAt,
      createdAt: s.createdAt,
      note: s.note,
      from: s.fromUser,
      to: s.toUser,
    })),
  };
}
export type GroupDetail = Awaited<ReturnType<typeof getGroup>>;

/**
 * Rename a group (any member). The currency can only change while the group has no expenses or
 * payments: amounts are stored in the currency they were recorded in and MVP1 doesn't convert.
 */
export async function updateGroup(userId: string, groupId: string, input: unknown) {
  await assertGroupMember(groupId, userId);
  const data = parse(groupSchema, input);
  const group = await db.group.findUniqueOrThrow({
    where: { id: groupId },
    select: { currency: true, _count: { select: { expenses: true, settlements: true } } },
  });
  const changesCurrency = Boolean(data.currency && data.currency !== group.currency);
  if (changesCurrency && group._count.expenses + group._count.settlements > 0) {
    throw new AppError(CURRENCY_LOCKED, "CONFLICT", { currency: CURRENCY_LOCKED });
  }
  return db.group.update({
    where: { id: groupId },
    data: { name: data.name, ...(changesCurrency ? { currency: data.currency } : {}) },
    select: { id: true, name: true, currency: true },
  });
}

export const CURRENCY_LOCKED = "The currency can't change once the group has expenses or payments.";

export async function addMemberByEmail(userId: string, groupId: string, input: unknown) {
  await assertGroupMember(groupId, userId);
  const result = await db.$transaction(async (tx) => {
    const { user: invitee, created } = await findOrCreateInvitee(tx, input, userId);
    const existing = await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId: invitee.id } } });
    if (existing) throw new AppError(`${invitee.name} is already in this group.`, "CONFLICT", { email: "Already in this group." });
    await tx.groupMember.create({ data: { groupId, userId: invitee.id } });
    await ensureFriendship(tx, userId, invitee.id);
    return { invitee, created };
  });
  const { invitee } = result;
  // Placeholders (new or not yet claimed) get an email inviting them to set up their account.
  if (invitee.status === "placeholder") {
    const [me, group] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true } }),
      db.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true } }),
    ]);
    await sendClaimInvite(invitee.id, `${me.name} added you to ${group.name}`);
  }
  return { id: invitee.id, name: invitee.name, invited: invitee.status === "placeholder" };
}

/** Remove a member (or leave, when memberId === userId). Only allowed when their balance is settled. */
export async function removeMember(userId: string, groupId: string, memberId: string) {
  const me = await assertGroupMember(groupId, userId);
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId }, select: { createdById: true } });
  const leaving = memberId === userId;
  if (!leaving && me.role !== "admin" && group.createdById !== userId) {
    throw forbidden("Only the group's admin can remove other members.");
  }
  const target = await db.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: memberId } },
    select: { user: { select: { name: true } } },
  });
  if (!target) throw notFound("member");

  const { nets } = await loadGroupLedger(groupId);
  if ((nets.get(memberId) ?? 0) !== 0) {
    throw new AppError(
      leaving
        ? "Settle up your balance in this group before leaving."
        : `${target.user.name} still has an unsettled balance. Settle up before removing them.`,
      "CONFLICT",
    );
  }
  await db.$transaction(async (tx) => {
    await tx.groupMember.delete({ where: { groupId_userId: { groupId, userId: memberId } } });
    // Someone removed by an admin may have kept the invite link: issue a new one so it can't be used to rejoin.
    if (!leaving) await tx.group.update({ where: { id: groupId }, data: { inviteVersion: { increment: 1 } } });
  });
  return { left: leaving, inviteLinkReset: !leaving };
}

export async function deleteGroup(userId: string, groupId: string) {
  const me = await assertGroupMember(groupId, userId);
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId }, select: { createdById: true } });
  if (me.role !== "admin" && group.createdById !== userId) throw forbidden("Only the group's admin can delete it.");
  // Deleting removes every expense and payment with it, so it would wipe out what people are owed.
  const { nets } = await loadGroupLedger(groupId);
  if ([...nets.values()].some((cents) => cents !== 0)) {
    throw new AppError("Settle up everyone's balance before deleting this group.", "CONFLICT");
  }
  await db.group.delete({ where: { id: groupId } });
}

/** Everywhere the user can add an expense: their groups (with members) and their friends. */
export async function getExpenseContexts(userId: string) {
  const [memberships, friendships, me] = await Promise.all([
    db.groupMember.findMany({
      where: { userId },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            currency: true,
            members: { select: { user: { select: userSummary } }, orderBy: { joinedAt: "asc" } },
          },
        },
      },
      orderBy: { group: { updatedAt: "desc" } },
    }),
    db.friendship.findMany({
      where: { status: "accepted", OR: [{ userId }, { friendId: userId }] },
      select: { user: { select: userSummary }, friend: { select: userSummary } },
    }),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { ...userSummary, defaultCurrency: true } }),
  ]);
  const friends = friendships
    .map((f) => (f.user.id === userId ? f.friend : f.user))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    me: { id: me.id, name: me.name, email: me.email },
    groups: memberships.map(({ group }) => ({
      id: group.id,
      name: group.name,
      currency: group.currency,
      members: group.members.map((m) => m.user),
    })),
    friends: friends.map((f) => ({ ...f, currency: me.defaultCurrency })),
  };
}
export type ExpenseContexts = Awaited<ReturnType<typeof getExpenseContexts>>;
