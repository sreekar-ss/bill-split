import "server-only";
import { stakeInExpense } from "@/lib/domain/ledger";
import type { Cents } from "@/lib/domain/money";
import { db } from "./db";
import { computeRelations } from "./ledger";
import { listGroups } from "./groups";

const userSummary = { id: true, name: true } as const;

export type ActivityItem =
  | {
      type: "expense";
      id: string;
      createdAt: Date;
      date: Date;
      description: string;
      amountCents: Cents;
      currency: string;
      category: string;
      paidBy: { id: string; name: string };
      createdBy: { id: string; name: string };
      group: { id: string; name: string } | null;
      /** for direct expenses: the other person */
      friend: { id: string; name: string } | null;
      myStakeCents: Cents;
    }
  | {
      type: "payment";
      id: string;
      createdAt: Date;
      date: Date;
      amountCents: Cents;
      currency: string;
      from: { id: string; name: string };
      to: { id: string; name: string };
      group: { id: string; name: string } | null;
      note: string | null;
    };

/** Recent expenses and payments the user can see, newest recorded first. */
export async function listActivity(userId: string, limit = 50): Promise<ActivityItem[]> {
  const myGroups = { members: { some: { userId } } };
  const [expenses, payments] = await Promise.all([
    db.expense.findMany({
      where: { OR: [{ group: myGroups }, { groupId: null, splits: { some: { userId } } }] },
      select: {
        id: true,
        createdAt: true,
        date: true,
        description: true,
        amountCents: true,
        currency: true,
        category: true,
        paidById: true,
        paidBy: { select: userSummary },
        createdBy: { select: userSummary },
        group: { select: { id: true, name: true } },
        splits: { select: { userId: true, amountCents: true, user: { select: userSummary } } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    db.settlement.findMany({
      where: { OR: [{ group: myGroups }, { groupId: null, OR: [{ fromUserId: userId }, { toUserId: userId }] }] },
      select: {
        id: true,
        createdAt: true,
        settledAt: true,
        amountCents: true,
        currency: true,
        note: true,
        fromUser: { select: userSummary },
        toUser: { select: userSummary },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const items: ActivityItem[] = [
    ...expenses.map((e): ActivityItem => ({
      type: "expense",
      id: e.id,
      createdAt: e.createdAt,
      date: e.date,
      description: e.description,
      amountCents: e.amountCents,
      currency: e.currency,
      category: e.category,
      paidBy: e.paidBy,
      createdBy: e.createdBy,
      group: e.group,
      friend: e.group ? null : (e.splits.find((s) => s.userId !== userId)?.user ?? null),
      myStakeCents: stakeInExpense(userId, { paidById: e.paidById, amountCents: e.amountCents, shares: e.splits }),
    })),
    ...payments.map((p): ActivityItem => ({
      type: "payment",
      id: p.id,
      createdAt: p.createdAt,
      date: p.settledAt,
      amountCents: p.amountCents,
      currency: p.currency,
      from: p.fromUser,
      to: p.toUser,
      group: p.group,
      note: p.note,
    })),
  ];
  return items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

export async function getDashboard(userId: string) {
  const [relations, groups, recent, user] = await Promise.all([
    computeRelations(userId),
    listGroups(userId),
    listActivity(userId, 6),
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { defaultCurrency: true } }),
  ]);
  const ids = [...relations.keys()];
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } });
  const byId = new Map(users.map((u) => [u.id, u]));

  const people = ids
    .map((id) => ({ user: byId.get(id) ?? { id, name: "Unknown", email: "" }, ...relations.get(id)! }))
    .filter((p) => p.totalCents !== 0)
    .sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents));

  const owedToMeCents = people.filter((p) => p.totalCents > 0).reduce((s, p) => s + p.totalCents, 0);
  const iOweCents = people.filter((p) => p.totalCents < 0).reduce((s, p) => s - p.totalCents, 0);

  return {
    currency: user.defaultCurrency,
    owedToMeCents,
    iOweCents,
    netCents: owedToMeCents - iOweCents,
    people,
    groups,
    recent,
  };
}
export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
