import "server-only";
import { z } from "zod";
import { fromDateInput } from "@/lib/domain/dates";
import { stakeInExpense } from "@/lib/domain/ledger";
import { EXPENSE_CATEGORIES } from "@/lib/validation";
import type { Prisma } from "@/lib/generated/prisma/client";
import { db } from "./db";
import { parse } from "./parse";

/** Search and filter every expense the user can see (their groups + direct expenses with friends). */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  groupId: z.string().max(64).optional(),
  /** Expenses involving both you and this friend (in any group or directly). */
  friendId: z.string().max(64).optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  /** "me" = you paid; "others" = someone else paid. */
  paidBy: z.enum(["me", "others"]).optional(),
  minCents: z.number().int().min(0).optional(),
  maxCents: z.number().int().min(0).optional(),
  page: z.number().int().min(0).max(1000).default(0),
});
export type SearchFilters = z.input<typeof searchSchema>;

const PAGE_SIZE = 30;

export async function searchExpenses(userId: string, input: unknown) {
  const f = parse(searchSchema, input);
  const visible: Prisma.ExpenseWhereInput = {
    OR: [{ group: { members: { some: { userId } } } }, { groupId: null, splits: { some: { userId } } }],
  };
  const and: Prisma.ExpenseWhereInput[] = [visible];
  if (f.q) {
    and.push({
      OR: [{ description: { contains: f.q, mode: "insensitive" } }, { notes: { contains: f.q, mode: "insensitive" } }],
    });
  }
  if (f.groupId) and.push({ groupId: f.groupId });
  if (f.friendId) {
    const involves = (id: string): Prisma.ExpenseWhereInput => ({ OR: [{ paidById: id }, { splits: { some: { userId: id, amountCents: { gt: 0 } } } }] });
    and.push(involves(userId), involves(f.friendId));
  }
  if (f.category) and.push({ category: f.category });
  if (f.from) and.push({ date: { gte: fromDateInput(f.from) } });
  if (f.to) and.push({ date: { lte: fromDateInput(f.to) } });
  if (f.paidBy === "me") and.push({ paidById: userId });
  if (f.paidBy === "others") and.push({ paidById: { not: userId } });
  if (f.minCents !== undefined) and.push({ amountCents: { gte: f.minCents } });
  if (f.maxCents !== undefined) and.push({ amountCents: { lte: f.maxCents } });

  const rows = await db.expense.findMany({
    where: { AND: and },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    skip: f.page * PAGE_SIZE,
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      description: true,
      amountCents: true,
      currency: true,
      category: true,
      date: true,
      paidById: true,
      recurringId: true,
      paidBy: { select: { id: true, name: true, status: true } },
      group: { select: { id: true, name: true } },
      splits: { select: { userId: true, amountCents: true, user: { select: { id: true, name: true, status: true } } } },
    },
  });
  const items = rows.slice(0, PAGE_SIZE).map((e) => ({
    id: e.id,
    description: e.description,
    amountCents: e.amountCents,
    currency: e.currency,
    category: e.category,
    date: e.date,
    recurring: Boolean(e.recurringId),
    paidBy: e.paidBy,
    group: e.group,
    friend: e.group ? null : (e.splits.find((s) => s.userId !== userId)?.user ?? null),
    myStakeCents: stakeInExpense(userId, { paidById: e.paidById, amountCents: e.amountCents, shares: e.splits }),
    involvesMe: e.paidById === userId || e.splits.some((s) => s.userId === userId && s.amountCents > 0),
  }));
  return { items, page: f.page, hasMore: rows.length > PAGE_SIZE };
}
export type SearchResult = Awaited<ReturnType<typeof searchExpenses>>;
