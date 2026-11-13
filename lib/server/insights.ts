import "server-only";
import { fromDateInput, toDateInput } from "@/lib/domain/dates";
import type { Cents } from "@/lib/domain/money";
import { displayName } from "@/lib/utils/person";
import { canViewGroup } from "./access";
import { db } from "./db";
import { notFound } from "./errors";

/**
 * Spending insights. "Your spending" = your share of expenses (what you consumed), not what you
 * paid for others. Payments are settling up, not spending, so they're excluded. Grouped per
 * currency (amounts in different currencies are never added together).
 */

export interface MonthPoint {
  /** yyyy-mm */
  month: string;
  cents: Cents;
}

function monthsBack(today: string, months: number): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

function windowStart(months: string[]) {
  return fromDateInput(`${months[0]}-01`);
}

function sortDesc<T extends { cents: Cents }>(xs: T[]) {
  return xs.sort((a, b) => b.cents - a.cents);
}

/** Your share of spending by month and category, across all your groups and friends. */
export async function getPersonalInsights(userId: string, { months = 6, today = toDateInput(new Date()) } = {}) {
  const span = monthsBack(today, Math.min(Math.max(months, 1), 24));
  const shares = await db.expenseSplit.findMany({
    where: { userId, amountCents: { gt: 0 }, expense: { date: { gte: windowStart(span) } } },
    select: {
      amountCents: true,
      expense: { select: { currency: true, category: true, date: true, group: { select: { id: true, name: true } } } },
    },
  });

  const byCurrency = new Map<string, { monthly: Map<string, Cents>; categories: Map<string, Cents>; groups: Map<string, { name: string; cents: Cents }>; total: Cents }>();
  for (const s of shares) {
    const cur = s.expense.currency;
    const month = toDateInput(s.expense.date).slice(0, 7);
    if (!span.includes(month)) continue;
    let c = byCurrency.get(cur);
    if (!c) byCurrency.set(cur, (c = { monthly: new Map(), categories: new Map(), groups: new Map(), total: 0 }));
    c.total += s.amountCents;
    c.monthly.set(month, (c.monthly.get(month) ?? 0) + s.amountCents);
    c.categories.set(s.expense.category, (c.categories.get(s.expense.category) ?? 0) + s.amountCents);
    const g = s.expense.group ? { id: s.expense.group.id, name: s.expense.group.name } : { id: "direct", name: "With friends" };
    const prev = c.groups.get(g.id);
    c.groups.set(g.id, { name: g.name, cents: (prev?.cents ?? 0) + s.amountCents });
  }

  return {
    months: span,
    currencies: [...byCurrency.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([currency, c]) => ({
        currency,
        totalCents: c.total,
        monthly: span.map((month) => ({ month, cents: c.monthly.get(month) ?? 0 })),
        byCategory: sortDesc([...c.categories].map(([category, cents]) => ({ category, cents }))),
        byGroup: sortDesc([...c.groups].map(([id, g]) => ({ id, name: g.name, cents: g.cents }))),
      })),
  };
}
export type PersonalInsights = Awaited<ReturnType<typeof getPersonalInsights>>;

/** A group's total spending by month, category and person (what each person paid and consumed). */
export async function getGroupInsights(userId: string, groupId: string, { months = 6, today = toDateInput(new Date()) } = {}) {
  if (!(await canViewGroup(userId, groupId))) throw notFound("group");
  const span = monthsBack(today, Math.min(Math.max(months, 1), 24));
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId }, select: { name: true, currency: true } });
  const expenses = await db.expense.findMany({
    where: { groupId, date: { gte: windowStart(span) } },
    select: {
      amountCents: true,
      category: true,
      date: true,
      paidBy: { select: { id: true, name: true, status: true } },
      splits: { select: { amountCents: true, user: { select: { id: true, name: true, status: true } } } },
    },
  });
  const monthly = new Map<string, Cents>();
  const categories = new Map<string, Cents>();
  const people = new Map<string, { name: string; paidCents: Cents; shareCents: Cents }>();
  const person = (u: { id: string; name: string; status: string }) => {
    let p = people.get(u.id);
    if (!p) people.set(u.id, (p = { name: u.id === userId ? "You" : displayName(u), paidCents: 0, shareCents: 0 }));
    return p;
  };
  let total = 0;
  for (const e of expenses) {
    const month = toDateInput(e.date).slice(0, 7);
    if (!span.includes(month)) continue;
    total += e.amountCents;
    monthly.set(month, (monthly.get(month) ?? 0) + e.amountCents);
    categories.set(e.category, (categories.get(e.category) ?? 0) + e.amountCents);
    person(e.paidBy).paidCents += e.amountCents;
    for (const s of e.splits) if (s.amountCents > 0) person(s.user).shareCents += s.amountCents;
  }
  return {
    groupName: group.name,
    currency: group.currency,
    months: span,
    totalCents: total,
    monthly: span.map((month) => ({ month, cents: monthly.get(month) ?? 0 })),
    byCategory: sortDesc([...categories].map(([category, cents]) => ({ category, cents }))),
    byPerson: [...people].map(([id, p]) => ({ id, ...p })).sort((a, b) => b.shareCents - a.shareCents),
  };
}
export type GroupInsights = Awaited<ReturnType<typeof getGroupInsights>>;
