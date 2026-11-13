import "server-only";
import { fromDateInput, toDateInput } from "@/lib/domain/dates";
import { describeSchedule, type Frequency } from "@/lib/domain/recurrence";
import { computeShares, type SplitMethod } from "@/lib/domain/splits";
import { expenseSchema, type ExpenseInput } from "@/lib/validation";
import { db } from "./db";
import { AppError, notFound } from "./errors";
import { areFriends } from "./friends";
import { throwIfArchived } from "./groups";
import { parse } from "./parse";

type ParsedExpense = ReturnType<typeof expenseSchema.parse>;

/** Who can be on this expense, and which currency it's in. Also authorizes the caller. */
async function resolveContext(userId: string, data: Pick<ParsedExpense, "groupId" | "friendId">) {
  if (data.groupId) {
    const group = await db.group.findFirst({
      where: { id: data.groupId, members: { some: { userId } } },
      select: { currency: true, archivedAt: true, members: { select: { userId: true } } },
    });
    if (!group) throw notFound("group");
    throwIfArchived(group.archivedAt);
    return { participants: group.members.map((m) => m.userId), currency: group.currency, direct: false };
  }
  const friendId = data.friendId!;
  if (!(await areFriends(userId, friendId))) throw notFound("friend");
  const me = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { defaultCurrency: true } });
  return { participants: [userId, friendId], currency: me.defaultCurrency, direct: true };
}

function buildShares(data: ParsedExpense, participants: string[], direct: boolean, alsoAllowed: string[] = []) {
  const allowed = new Set([...participants, ...alsoAllowed]);
  const scope = direct ? "you or your friend" : "in this group";
  if (!allowed.has(data.paidById)) {
    throw new AppError(`The person who paid must be ${scope}.`, "VALIDATION", { paidById: `Choose someone ${direct ? "here" : "in this group"}.` });
  }
  if (data.split.entries.some((e) => !allowed.has(e.userId))) {
    throw new AppError(`Everyone in the split must be ${scope}.`, "VALIDATION", { split: `Someone in the split isn't ${scope}.` });
  }
  const result = computeShares(data.amountCents, data.split.method, data.split.entries);
  if (!result.ok) throw new AppError(result.error, "VALIDATION", { split: result.error });

  if (result.shares.every((s) => s.userId === data.paidById)) {
    throw new AppError("This expense only involves the person who paid, so nobody owes anything.", "VALIDATION", {
      split: "Include at least one person besides the payer.",
    });
  }

  const inputByUser = new Map(data.split.entries.map((e) => [e.userId, e.value]));
  const rows = result.shares.map((s) => ({
    userId: s.userId,
    amountCents: s.amountCents,
    percentage: data.split.method === "percentage" ? (inputByUser.get(s.userId) ?? null) : null,
    shares: data.split.method === "shares" ? (inputByUser.get(s.userId) ?? null) : null,
  }));
  // Direct expenses always record both friends so the pair is recoverable from the shares.
  if (direct) {
    for (const id of participants) {
      if (!rows.some((r) => r.userId === id)) rows.push({ userId: id, amountCents: 0, percentage: null, shares: null });
    }
  }
  return rows;
}

/** Internal-only fields (never from user input): link to the recurring schedule that created it. */
export interface ExpenseOrigin {
  recurringId?: string;
  recurrenceKey?: string;
  /**
   * The schedule's currency. A direct expense otherwise takes the creator's *current* default
   * currency, which may have changed since the schedule was set up. (Groups lock their currency.)
   */
  currency?: string;
}

export async function createExpense(userId: string, input: ExpenseInput | unknown, origin: ExpenseOrigin = {}) {
  const { id, groupId } = await saveExpense(userId, input, origin);
  return { id, groupId };
}

/**
 * createExpense, plus whether this call saved it: `created` is false when the clientId was already
 * used (an idempotent re-send), so callers notify people only once.
 */
export async function saveExpense(userId: string, input: ExpenseInput | unknown, origin: ExpenseOrigin = {}) {
  const data = parse(expenseSchema, input);
  // Idempotent re-send (offline queue, double tap): the same clientId returns the expense already saved.
  if (data.clientId) {
    const existing = await findByClientId(userId, data.clientId);
    if (existing) return { ...existing, created: false };
  }
  const ctx = await resolveContext(userId, data);
  const rows = buildShares(data, ctx.participants, ctx.direct);
  try {
    return { ...(await insertExpense()), created: true };
  } catch (error) {
    // Two sends racing with the same clientId: the loser returns the winner's expense.
    const duplicate = typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
    const winner = duplicate && data.clientId ? await findByClientId(userId, data.clientId) : null;
    if (winner) return { ...winner, created: false };
    throw error;
  }

  function insertExpense() {
    return db.expense.create({
      data: {
        description: data.description,
        amountCents: data.amountCents,
        currency: ctx.direct && origin.currency ? origin.currency : ctx.currency,
        category: data.category,
        date: fromDateInput(data.date),
        notes: data.notes || null,
        splitMethod: data.split.method,
        groupId: data.groupId ?? null,
        paidById: data.paidById,
        createdById: userId,
        recurringId: origin.recurringId ?? null,
        recurrenceKey: origin.recurrenceKey ?? null,
        clientId: data.clientId ?? null,
        splits: { create: rows },
      },
      select: { id: true, groupId: true },
    });
  }
}

async function findByClientId(userId: string, clientId: string) {
  const e = await db.expense.findUnique({ where: { clientId }, select: { id: true, groupId: true, createdById: true } });
  if (!e) return null;
  if (e.createdById !== userId) throw new AppError("That expense couldn't be saved. Try again.", "CONFLICT");
  return { id: e.id, groupId: e.groupId };
}

/** Loads an expense the user may see, plus which context it belongs to. */
async function loadAuthorized(userId: string, expenseId: string) {
  const expense = await db.expense.findUnique({
    where: { id: expenseId },
    include: {
      splits: { select: { userId: true, amountCents: true, percentage: true, shares: true } },
      recurring: {
        select: { id: true, frequency: true, interval: true, anchorDay: true, nextRunOn: true, endsOn: true, pausedAt: true, stoppedAt: true, lastError: true },
      },
      paidBy: { select: { id: true, name: true, email: true, status: true } },
      createdBy: { select: { id: true, name: true, status: true } },
      group: { select: { id: true, name: true, currency: true, archivedAt: true, members: { select: { userId: true } } } },
    },
  });
  if (!expense) throw notFound("expense");
  if (expense.group) {
    if (!expense.group.members.some((m) => m.userId === userId)) throw notFound("expense");
  } else if (!expense.splits.some((s) => s.userId === userId)) {
    throw notFound("expense");
  }
  return expense;
}

export async function getExpense(userId: string, expenseId: string) {
  const e = await loadAuthorized(userId, expenseId);
  const friendId = e.group ? undefined : e.splits.find((s) => s.userId !== userId)?.userId;
  const people = await db.user.findMany({
    where: { id: { in: [...new Set([...e.splits.map((s) => s.userId), e.paidById])] } },
    select: { id: true, name: true, email: true, status: true },
  });
  const nameOf = new Map(people.map((p) => [p.id, p]));
  return {
    id: e.id,
    description: e.description,
    amountCents: e.amountCents,
    currency: e.currency,
    category: e.category,
    date: toDateInput(e.date),
    notes: e.notes ?? "",
    splitMethod: e.splitMethod as SplitMethod,
    groupId: e.groupId ?? undefined,
    group: e.group ? { id: e.group.id, name: e.group.name } : null,
    friendId,
    paidBy: e.paidBy,
    createdBy: e.createdBy,
    /** Present when a recurring schedule created this expense. */
    recurring: e.recurring
      ? {
          id: e.recurring.id,
          schedule: describeSchedule({ frequency: e.recurring.frequency as Frequency, interval: e.recurring.interval, anchorDay: e.recurring.anchorDay }),
          nextRunOn: toDateInput(e.recurring.nextRunOn),
          endsOn: e.recurring.endsOn ? toDateInput(e.recurring.endsOn) : null,
          state: e.recurring.stoppedAt ? ("stopped" as const) : e.recurring.pausedAt ? ("paused" as const) : ("active" as const),
          /** Why the daily job paused it (e.g. someone left the group), when it paused itself. */
          lastError: e.recurring.pausedAt && !e.recurring.stoppedAt ? e.recurring.lastError : null,
        }
      : null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    shares: e.splits.map((s) => ({
      user: nameOf.get(s.userId) ?? { id: s.userId, name: "Former member", email: "", status: "deleted" },
      amountCents: s.amountCents,
      percentage: s.percentage,
      shares: s.shares,
    })),
  };
}
export type ExpenseDetail = Awaited<ReturnType<typeof getExpense>>;

export async function updateExpense(userId: string, expenseId: string, input: unknown) {
  const existing = await loadAuthorized(userId, expenseId);
  const data = parse(expenseSchema, input);
  const sameContext = existing.groupId
    ? data.groupId === existing.groupId
    : !data.groupId && existing.splits.some((s) => s.userId === data.friendId);
  if (!sameContext) throw new AppError("An expense can't be moved to a different group or friend.", "VALIDATION");

  const ctx = await resolveContext(userId, data);
  // People who have left the group stay on their old expenses. They can't be settled with any more,
  // so an edit may keep them on the expense but must not change what they paid or owe.
  const current = new Set(ctx.participants);
  const before = [...new Set([existing.paidById, ...existing.splits.map((s) => s.userId)])];
  const former = ctx.direct ? [] : before.filter((id) => !current.has(id));
  const rows = buildShares(data, ctx.participants, ctx.direct, former);
  if (former.length) assertFormerMembersUnchanged(existing, data, rows, former);
  return db.$transaction(async (tx) => {
    await tx.expenseSplit.deleteMany({ where: { expenseId } });
    return tx.expense.update({
      where: { id: expenseId },
      data: {
        description: data.description,
        amountCents: data.amountCents,
        category: data.category,
        date: fromDateInput(data.date),
        notes: data.notes || null,
        splitMethod: data.split.method,
        paidById: data.paidById,
        splits: { create: rows },
      },
      select: { id: true, groupId: true },
    });
  });
}

/** What one person paid minus what they owe on an expense: their effect on the group's balances. */
function netEffect(userId: string, e: { paidById: string; amountCents: number; splits: { userId: string; amountCents: number }[] }) {
  const share = e.splits.filter((s) => s.userId === userId).reduce((sum, s) => sum + s.amountCents, 0);
  return (e.paidById === userId ? e.amountCents : 0) - share;
}

function assertFormerMembersUnchanged(
  existing: Awaited<ReturnType<typeof loadAuthorized>>,
  data: ParsedExpense,
  rows: { userId: string; amountCents: number }[],
  former: string[],
) {
  const after = { paidById: data.paidById, amountCents: data.amountCents, splits: rows };
  const changed = former.filter((id) => netEffect(id, existing) !== netEffect(id, after));
  if (!changed.length) return;
  const wasPayer = changed.includes(existing.paidById);
  throw new AppError(
    wasPayer
      ? "The person who paid has left this group, so the amount, payer and their share can't change. You can still edit the description, date, category and note."
      : "Someone on this expense has left the group, so their share can't change. Keep their amount as it was, or ask them to rejoin first.",
    "VALIDATION",
    wasPayer ? { split: "The payer has left this group." } : { split: "Keep the share of anyone who has left the group." },
  );
}

export async function deleteExpense(userId: string, expenseId: string) {
  const e = await loadAuthorized(userId, expenseId);
  if (e.group) {
    throwIfArchived(e.group.archivedAt);
    // Like updateExpense: someone who has left can't be settled with, so deleting must not change their balance.
    const current = new Set(e.group.members.map((m) => m.userId));
    const former = [...new Set([e.paidById, ...e.splits.map((s) => s.userId)])].filter((id) => !current.has(id));
    if (former.some((id) => netEffect(id, e) !== 0)) {
      throw new AppError("Someone on this expense has left the group, so it can't be deleted. Ask them to rejoin first.", "CONFLICT");
    }
  }
  await db.expense.delete({ where: { id: expenseId } });
  return { groupId: e.groupId, friendId: e.group ? undefined : e.splits.find((s) => s.userId !== userId)?.userId };
}
