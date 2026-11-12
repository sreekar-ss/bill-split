import "server-only";
import { verifyPassword } from "@/lib/auth/password";
import { deleteAccountSchema, paymentHandlesSchema } from "@/lib/validation";
import { db } from "./db";
import { AppError } from "./errors";
import { computeRelations } from "./ledger";
import { parse } from "./parse";

export async function updatePaymentHandles(userId: string, input: unknown) {
  const data = parse(paymentHandlesSchema, input);
  return db.user.update({
    where: { id: userId },
    data: {
      venmoHandle: data.venmoHandle?.replace(/^@/, "") ?? null,
      paypalMe: data.paypalMe ?? null,
      cashTag: data.cashTag?.replace(/^\$/, "") ?? null,
      upiId: data.upiId ?? null,
    },
    select: { venmoHandle: true, paypalMe: true, cashTag: true, upiId: true },
  });
}

/** Signs out every session, including the current one. */
export async function logoutEverywhere(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

/**
 * Everything we hold about the user, as plain JSON (profile, groups, expenses and payments they're
 * part of, friends). Other people appear by name only.
 */
export async function exportAccountData(userId: string) {
  const [profile, memberships, expenses, payments, friendships] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, email: true, defaultCurrency: true, emailVerified: true, createdAt: true, venmoHandle: true, paypalMe: true, cashTag: true, upiId: true },
    }),
    db.groupMember.findMany({ where: { userId }, select: { role: true, joinedAt: true, group: { select: { id: true, name: true, currency: true } } } }),
    db.expense.findMany({
      where: { OR: [{ paidById: userId }, { splits: { some: { userId } } }] },
      select: {
        id: true, description: true, amountCents: true, currency: true, category: true, date: true, notes: true, splitMethod: true, createdAt: true,
        group: { select: { name: true } },
        paidBy: { select: { name: true } },
        splits: { select: { amountCents: true, user: { select: { name: true } } } },
      },
      orderBy: { date: "asc" },
    }),
    db.settlement.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { id: true, amountCents: true, currency: true, settledAt: true, note: true, group: { select: { name: true } }, fromUser: { select: { name: true } }, toUser: { select: { name: true } } },
      orderBy: { settledAt: "asc" },
    }),
    db.friendship.findMany({
      where: { status: "accepted", OR: [{ userId }, { friendId: userId }] },
      select: { user: { select: { id: true, name: true } }, friend: { select: { id: true, name: true } }, createdAt: true },
    }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    note: "Amounts are in cents of the listed currency.",
    profile,
    groups: memberships.map((m) => ({ ...m.group, role: m.role, joinedAt: m.joinedAt })),
    expenses: expenses.map((e) => ({
      ...e,
      group: e.group?.name ?? null,
      paidBy: e.paidBy.name,
      shares: e.splits.map((s) => ({ name: s.user.name, amountCents: s.amountCents })),
      splits: undefined,
    })),
    payments: payments.map((p) => ({ ...p, group: p.group?.name ?? null, from: p.fromUser.name, to: p.toUser.name, fromUser: undefined, toUser: undefined })),
    friends: friendships.map((f) => ({ name: f.user.id === userId ? f.friend.name : f.user.name, since: f.createdAt })),
  };
}

/**
 * Deletes the account by anonymising it: other people's ledgers keep their history (shown as
 * "Deleted user"). Only allowed when every balance is settled. Requires the password.
 */
export async function deleteAccount(userId: string, input: unknown) {
  const { password } = parse(deleteAccountSchema, input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { password: true } });
  if (!(await verifyPassword(password, user.password))) {
    throw new AppError("That password isn't right.", "VALIDATION", { password: "That password isn't right." });
  }
  const relations = await computeRelations(userId);
  const open = [...relations.values()].filter((r) => r.byContext.some((c) => c.cents !== 0));
  if (open.length > 0) {
    throw new AppError(
      `Settle up first: you still have open balances with ${open.length} ${open.length === 1 ? "person" : "people"}.`,
      "CONFLICT",
    );
  }
  await db.$transaction(async (tx) => {
    await tx.groupMember.deleteMany({ where: { userId } });
    await tx.friendship.deleteMany({ where: { OR: [{ userId }, { friendId: userId }] } });
    await tx.passwordResetToken.deleteMany({ where: { userId } });
    await tx.emailToken.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        status: "deleted",
        name: "Deleted user",
        email: `deleted+${userId}@deleted.invalid`,
        password: "",
        phone: null,
        avatar: null,
        venmoHandle: null,
        paypalMe: null,
        cashTag: null,
        upiId: null,
        emailVerified: false,
        sessionVersion: { increment: 1 },
      },
    });
  });
}
