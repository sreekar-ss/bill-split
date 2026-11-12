import "server-only";
import { computeNets, relationsFor, simplifyDebts, type LedgerExpense, type LedgerPayment, type Transfer } from "@/lib/domain/ledger";
import type { Cents } from "@/lib/domain/money";
import { db } from "./db";

/**
 * Balances live in "contexts": each group is one, and each pair of friends has one direct context
 * for expenses/payments recorded outside any group. Within a context, debts are simplified; across
 * contexts, the amounts between two people are summed.
 */

export type ContextRef = { kind: "group"; groupId: string; name: string; currency: string } | { kind: "direct"; currency: string };

export interface Relation {
  /** + they owe me, − I owe them */
  totalCents: Cents;
  byContext: { context: ContextRef; cents: Cents }[];
}

const ledgerExpenseSelect = {
  paidById: true,
  amountCents: true,
  splits: { select: { userId: true, amountCents: true } },
} as const;

const toLedger = (e: { paidById: string; amountCents: number; splits: { userId: string; amountCents: number }[] }): LedgerExpense => ({
  paidById: e.paidById,
  amountCents: e.amountCents,
  shares: e.splits,
});

export async function loadGroupLedger(groupId: string) {
  const [members, expenses, payments] = await Promise.all([
    db.groupMember.findMany({ where: { groupId }, select: { userId: true } }),
    db.expense.findMany({ where: { groupId }, select: ledgerExpenseSelect }),
    db.settlement.findMany({ where: { groupId }, select: { fromUserId: true, toUserId: true, amountCents: true } }),
  ]);
  const nets = computeNets(expenses.map(toLedger), payments, members.map((m) => m.userId));
  return { nets, plan: simplifyDebts(nets) };
}

/** Every person the user has a balance with, across all groups and direct expenses. */
export async function computeRelations(userId: string): Promise<Map<string, Relation>> {
  const [user, memberships, directExpenses, directPayments] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { defaultCurrency: true } }),
    db.groupMember.findMany({
      where: { userId },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            currency: true,
            expenses: { select: ledgerExpenseSelect },
            settlements: { select: { fromUserId: true, toUserId: true, amountCents: true } },
          },
        },
      },
    }),
    db.expense.findMany({ where: { groupId: null, splits: { some: { userId } } }, select: ledgerExpenseSelect }),
    db.settlement.findMany({
      where: { groupId: null, OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { fromUserId: true, toUserId: true, amountCents: true },
    }),
  ]);

  const relations = new Map<string, Relation>();
  const addRelations = (context: ContextRef, transfers: Transfer[]) => {
    for (const [other, cents] of relationsFor(userId, transfers)) {
      if (cents === 0) continue;
      const rel = relations.get(other) ?? { totalCents: 0, byContext: [] };
      rel.totalCents += cents;
      rel.byContext.push({ context, cents });
      relations.set(other, rel);
    }
  };

  for (const { group } of memberships) {
    const nets = computeNets(group.expenses.map(toLedger), group.settlements);
    addRelations({ kind: "group", groupId: group.id, name: group.name, currency: group.currency }, simplifyDebts(nets));
  }

  // Direct context: bucket by the other person, then net each pair.
  const byFriend = new Map<string, { expenses: LedgerExpense[]; payments: LedgerPayment[] }>();
  const bucket = (other: string) => {
    let b = byFriend.get(other);
    if (!b) byFriend.set(other, (b = { expenses: [], payments: [] }));
    return b;
  };
  for (const e of directExpenses) {
    const other = e.splits.find((s) => s.userId !== userId)?.userId ?? (e.paidById !== userId ? e.paidById : undefined);
    if (other) bucket(other).expenses.push(toLedger(e));
  }
  for (const p of directPayments) {
    bucket(p.fromUserId === userId ? p.toUserId : p.fromUserId).payments.push(p);
  }
  for (const b of byFriend.values()) {
    addRelations({ kind: "direct", currency: user.defaultCurrency }, simplifyDebts(computeNets(b.expenses, b.payments)));
  }

  return relations;
}

/** Signed net for the direct (non-group) context between two users. + other owes me. */
export async function directNet(userId: string, otherId: string): Promise<Cents> {
  const [expenses, payments] = await Promise.all([
    db.expense.findMany({
      where: { groupId: null, AND: [{ splits: { some: { userId } } }, { splits: { some: { userId: otherId } } }] },
      select: ledgerExpenseSelect,
    }),
    db.settlement.findMany({
      where: {
        groupId: null,
        OR: [
          { fromUserId: userId, toUserId: otherId },
          { fromUserId: otherId, toUserId: userId },
        ],
      },
      select: { fromUserId: true, toUserId: true, amountCents: true },
    }),
  ]);
  return computeNets(expenses.map(toLedger), payments).get(userId) ?? 0;
}
