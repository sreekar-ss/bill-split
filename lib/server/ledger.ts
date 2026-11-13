import "server-only";
import { cache } from "react";
import { computeNets, relationsFor, simplifyDebts, type LedgerExpense, type LedgerPayment, type Transfer } from "@/lib/domain/ledger";
import type { Cents } from "@/lib/domain/money";
import { db } from "./db";

/**
 * Balances live in "contexts": each group is one, and each pair of friends has one direct context
 * for expenses/payments recorded outside any group. Within a context, debts are simplified; across
 * contexts, the amounts between two people are summed.
 */

export type ContextRef = { kind: "group"; groupId: string; name: string; currency: string } | { kind: "direct"; currency: string };

/** An amount in one currency. Amounts in different currencies are never added together (no FX in MVP1). */
export interface CurrencyAmount {
  currency: string;
  cents: Cents;
}

export interface Relation {
  /** Per-currency totals, non-zero only: + they owe me, − I owe them. */
  totals: CurrencyAmount[];
  byContext: { context: ContextRef; cents: Cents }[];
}

/** Adds `cents` to the matching currency bucket in `totals` (mutates). */
export function addToTotals(totals: CurrencyAmount[], currency: string, cents: Cents) {
  const t = totals.find((x) => x.currency === currency);
  if (t) t.cents += cents;
  else totals.push({ currency, cents });
}

/** Drops zero totals and orders them: the `primary` currency first, then the largest amounts. */
export function tidyTotals(totals: CurrencyAmount[], primary: string): CurrencyAmount[] {
  return totals
    .filter((t) => t.cents !== 0)
    .sort((a, b) => Number(b.currency === primary) - Number(a.currency === primary) || Math.abs(b.cents) - Math.abs(a.cents));
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

/*
 * Per-request memoisation (React cache): one page often needs the same data from several loaders
 * (Home shows balances in the summary and on the friends list; Activity lists groups and friends).
 * Each is read from the database once per request. Outside a server render (actions, cron, tests)
 * cache() doesn't memoise, so a write is never followed by a stale read.
 */

/** The user's default currency. */
export const getDefaultCurrency = cache(async (userId: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { defaultCurrency: true } });
  return user.defaultCurrency;
});

/** Every group the user is in, with what both the group list and the balances need. */
export const loadMyGroups = cache((userId: string) =>
  db.groupMember.findMany({
    where: { userId },
    select: {
      group: {
        select: {
          id: true,
          name: true,
          currency: true,
          icon: true,
          archivedAt: true,
          updatedAt: true,
          _count: { select: { members: true } },
          members: { select: { user: { select: { id: true, name: true, status: true } } }, orderBy: { joinedAt: "asc" }, take: 5 },
          expenses: { select: { ...ledgerExpenseSelect, createdAt: true } },
          settlements: { select: { fromUserId: true, toUserId: true, amountCents: true, createdAt: true } },
        },
      },
    },
  }),
);

/** Every person the user has a balance with, across all groups and direct expenses. */
export const computeRelations = cache(async (userId: string): Promise<Map<string, Relation>> => {
  const [defaultCurrency, memberships, directExpenses, directPayments] = await Promise.all([
    getDefaultCurrency(userId),
    loadMyGroups(userId),
    db.expense.findMany({ where: { groupId: null, splits: { some: { userId } } }, select: { ...ledgerExpenseSelect, currency: true } }),
    db.settlement.findMany({
      where: { groupId: null, OR: [{ fromUserId: userId }, { toUserId: userId }] },
      select: { fromUserId: true, toUserId: true, amountCents: true, currency: true },
    }),
  ]);

  const relations = new Map<string, Relation>();
  const addRelations = (context: ContextRef, transfers: Transfer[]) => {
    for (const [other, cents] of relationsFor(userId, transfers)) {
      if (cents === 0) continue;
      const rel = relations.get(other) ?? { totals: [], byContext: [] };
      addToTotals(rel.totals, context.currency, cents);
      rel.byContext.push({ context, cents });
      relations.set(other, rel);
    }
  };

  for (const { group } of memberships) {
    const nets = computeNets(group.expenses.map(toLedger), group.settlements);
    addRelations({ kind: "group", groupId: group.id, name: group.name, currency: group.currency }, simplifyDebts(nets));
  }

  // Direct context: bucket by the other person and by the currency each record was made in
  // (a pair can have direct expenses in several currencies), then net each bucket.
  const direct = new Map<string, { currency: string; expenses: LedgerExpense[]; payments: LedgerPayment[] }>();
  const bucket = (other: string, currency: string) => {
    const key = `${other}\u0000${currency}`;
    let b = direct.get(key);
    if (!b) direct.set(key, (b = { currency, expenses: [], payments: [] }));
    return b;
  };
  for (const e of directExpenses) {
    const other = e.splits.find((s) => s.userId !== userId)?.userId ?? (e.paidById !== userId ? e.paidById : undefined);
    if (other) bucket(other, e.currency).expenses.push(toLedger(e));
  }
  for (const p of directPayments) {
    bucket(p.fromUserId === userId ? p.toUserId : p.fromUserId, p.currency).payments.push(p);
  }
  for (const b of direct.values()) {
    addRelations({ kind: "direct", currency: b.currency }, simplifyDebts(computeNets(b.expenses, b.payments)));
  }

  for (const rel of relations.values()) rel.totals = tidyTotals(rel.totals, defaultCurrency);
  return relations;
});

/**
 * Signed nets for the direct (non-group) context between two users, one per currency, non-zero
 * only. + other owes me.
 */
export async function directNets(userId: string, otherId: string): Promise<CurrencyAmount[]> {
  const [expenses, payments] = await Promise.all([
    db.expense.findMany({
      where: { groupId: null, AND: [{ splits: { some: { userId } } }, { splits: { some: { userId: otherId } } }] },
      select: { ...ledgerExpenseSelect, currency: true },
    }),
    db.settlement.findMany({
      where: {
        groupId: null,
        OR: [
          { fromUserId: userId, toUserId: otherId },
          { fromUserId: otherId, toUserId: userId },
        ],
      },
      select: { fromUserId: true, toUserId: true, amountCents: true, currency: true },
    }),
  ]);
  const currencies = new Set([...expenses.map((e) => e.currency), ...payments.map((p) => p.currency)]);
  return [...currencies]
    .map((currency) => ({
      currency,
      cents:
        computeNets(
          expenses.filter((e) => e.currency === currency).map(toLedger),
          payments.filter((p) => p.currency === currency),
        ).get(userId) ?? 0,
    }))
    .filter((t) => t.cents !== 0);
}
