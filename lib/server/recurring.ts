import "server-only";
import { fromDateInput, toDateInput } from "@/lib/domain/dates";
import { anchorFor, describeSchedule, endsOnTooSoon, firstRepeatOn, nextOccurrence, type Frequency } from "@/lib/domain/recurrence";
import { expenseSchema, recurrenceSchema } from "@/lib/validation";
import { db } from "./db";
import { AppError, notFound } from "./errors";
import { createExpense } from "./expenses";
import { areFriends } from "./friends";
import { assertNotArchived } from "./groups";
import { notifyExpenseCreated } from "./notifications";
import { parse } from "./parse";

/** Max occurrences created for one schedule in one run (bounds catch-up after downtime). */
const MAX_CATCH_UP = 6;

/**
 * Create an expense and make it repeat. The first occurrence is the expense itself (on its date);
 * the schedule then continues from firstRepeatOn (never in the past).
 */
export async function createRecurringExpense(
  userId: string,
  expenseInput: unknown,
  recurrenceInput: unknown,
  today = toDateInput(new Date()),
) {
  const data = parse(expenseSchema, expenseInput);
  const rec = parse(recurrenceSchema, recurrenceInput);
  if (rec.endsOn && rec.endsOn < data.date) {
    throw new AppError("The end date is before the first date.", "VALIDATION", { endsOn: "Choose a date on or after the expense date." });
  }
  const schedule = { frequency: rec.frequency as Frequency, interval: rec.interval, anchorDay: anchorFor(rec.frequency, data.date) };
  const nextRunOn = firstRepeatOn(schedule, data.date, today);
  if (rec.endsOn && rec.endsOn < nextRunOn) {
    // It would end before it ever repeats.
    throw new AppError("The end date is before the next repeat.", "VALIDATION", {
      endsOn: endsOnTooSoon(nextRunOn),
    });
  }

  // Validate + create the first occurrence through the normal path (authorization, split math).
  // With a clientId this is idempotent: a re-send after a lost response returns the saved expense.
  const first = await createExpense(userId, data);
  const expense = await db.expense.findUniqueOrThrow({ where: { id: first.id }, select: { currency: true, recurringId: true } });
  // Already made repeating by an earlier send of this same form: never add a second schedule.
  if (expense.recurringId) return { expenseId: first.id, recurringId: expense.recurringId, groupId: first.groupId };

  const created = await db.$transaction(async (tx) => {
    const recurring = await tx.recurringExpense.create({
    data: {
      createdById: userId,
      groupId: data.groupId ?? null,
      friendId: data.friendId ?? null,
      description: data.description,
      amountCents: data.amountCents,
      currency: expense.currency,
      category: data.category,
      notes: data.notes || null,
      paidById: data.paidById,
      splitMethod: data.split.method,
      splitEntries: data.split.entries,
      frequency: schedule.frequency,
      interval: schedule.interval,
      anchorDay: schedule.anchorDay,
      nextRunOn: fromDateInput(nextRunOn),
      endsOn: rec.endsOn ? fromDateInput(rec.endsOn) : null,
      lastRunOn: fromDateInput(data.date),
    },
    select: { id: true },
    });
    // Only link if no concurrent send of the same form linked it first; otherwise roll back.
    const { count } = await tx.expense.updateMany({
      where: { id: first.id, recurringId: null },
      data: { recurringId: recurring.id, recurrenceKey: `${recurring.id}:${data.date}` },
    });
    if (count !== 1) throw LOST_RACE;
    return recurring.id;
  }).catch(async (error) => {
    if (error !== LOST_RACE) throw error;
    const winner = await db.expense.findUniqueOrThrow({ where: { id: first.id }, select: { recurringId: true } });
    return winner.recurringId!;
  });
  return { expenseId: first.id, recurringId: created, groupId: first.groupId };
}
/** Thrown inside the transaction to roll back a schedule that a concurrent identical send beat. */
const LOST_RACE = new Error("recurring: lost clientId race");

/** Who may see/manage a schedule: group members, or either person in a direct one. */
async function loadManageable(userId: string, id: string) {
  const r = await db.recurringExpense.findUnique({ where: { id }, include: { group: { select: { members: { select: { userId: true } } } } } });
  if (!r) throw notFound("recurring expense");
  const ok = r.group ? r.group.members.some((m) => m.userId === userId) : r.createdById === userId || r.friendId === userId;
  if (!ok) throw notFound("recurring expense");
  // Archived groups are read-only, schedules included (no resuming one until it's unarchived).
  if (r.groupId) await assertNotArchived(r.groupId);
  return r;
}

export async function listRecurring(userId: string, ctx: { groupId?: string; friendId?: string }) {
  let where;
  if (ctx.groupId) {
    const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: ctx.groupId, userId } } });
    if (!member) throw notFound("group");
    where = { groupId: ctx.groupId };
  } else if (ctx.friendId) {
    where = {
      groupId: null,
      OR: [
        { createdById: userId, friendId: ctx.friendId },
        { createdById: ctx.friendId, friendId: userId },
      ],
    };
  } else {
    throw new AppError("Choose a group or a friend.", "VALIDATION");
  }
  const rows = await db.recurringExpense.findMany({
    where: { ...where, stoppedAt: null },
    orderBy: { nextRunOn: "asc" },
    select: {
      id: true, description: true, amountCents: true, currency: true, frequency: true, interval: true, anchorDay: true,
      nextRunOn: true, endsOn: true, pausedAt: true, lastError: true, paidById: true, createdById: true,
      createdBy: { select: { name: true } },
    },
  });
  const payers = new Map(
    (await db.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.paidById))] } }, select: { id: true, name: true, status: true } })).map((u) => [u.id, u]),
  );
  return rows.map((r) => ({
    id: r.id,
    description: r.description,
    amountCents: r.amountCents,
    currency: r.currency,
    schedule: describeSchedule({ frequency: r.frequency as Frequency, interval: r.interval, anchorDay: r.anchorDay }),
    nextRunOn: toDateInput(r.nextRunOn),
    endsOn: r.endsOn ? toDateInput(r.endsOn) : null,
    paused: Boolean(r.pausedAt),
    lastError: r.lastError,
    paidBy: payers.get(r.paidById) ?? { id: r.paidById, name: "Former member", status: "deleted" },
    /** True when the viewer pays, so lists can say "You pay". */
    paidByMe: r.paidById === userId,
    createdBy: r.createdBy.name,
  }));
}
export type RecurringSummary = Awaited<ReturnType<typeof listRecurring>>[number];

export async function pauseRecurring(userId: string, id: string) {
  await loadManageable(userId, id);
  await db.recurringExpense.update({ where: { id }, data: { pausedAt: new Date() } });
}

/** Resumes from the next future occurrence (missed periods while paused are not back-filled). */
export async function resumeRecurring(userId: string, id: string, today = toDateInput(new Date())) {
  const r = await loadManageable(userId, id);
  const schedule = { frequency: r.frequency as Frequency, interval: r.interval, anchorDay: r.anchorDay };
  let next = toDateInput(r.nextRunOn);
  while (next < today) next = nextOccurrence(schedule, next);
  await db.recurringExpense.update({ where: { id }, data: { pausedAt: null, lastError: null, nextRunOn: fromDateInput(next) } });
}

/** Stops the schedule for good. Expenses it already created stay. */
export async function stopRecurring(userId: string, id: string) {
  await loadManageable(userId, id);
  await db.recurringExpense.update({ where: { id }, data: { stoppedAt: new Date() } });
}

async function creatorBlocked(r: { groupId: string | null; friendId: string | null; createdById: string }): Promise<string | null> {
  if (r.groupId) {
    const member = await db.groupMember.findUnique({ where: { groupId_userId: { groupId: r.groupId, userId: r.createdById } }, select: { userId: true } });
    return member ? null : "The person who set this up is no longer in the group.";
  }
  if (r.friendId && !(await areFriends(r.createdById, r.friendId))) return "You two are no longer friends on BillSplit.";
  return null;
}

/**
 * Daily job: create every occurrence that is due (on or before `today`). Idempotent — each
 * occurrence has a unique recurrenceKey, so re-running the same day creates nothing new.
 * A schedule that can no longer be created (e.g. someone left the group) is paused with a reason.
 */
export async function runDueRecurring(today = toDateInput(new Date())) {
  const due = await db.recurringExpense.findMany({
    where: { stoppedAt: null, pausedAt: null, nextRunOn: { lte: fromDateInput(today) } },
    take: 500,
  });
  let created = 0;
  let paused = 0;
  for (const r of due) {
    // Occurrences are created as the person who set the schedule up. If they're no longer in the
    // group (or the friendship ended), no amount of resuming can fix it, so say exactly that.
    const blocked = await creatorBlocked(r);
    if (blocked) {
      await db.recurringExpense.update({ where: { id: r.id }, data: { pausedAt: new Date(), lastError: blocked } });
      paused++;
      continue;
    }
    const schedule = { frequency: r.frequency as Frequency, interval: r.interval, anchorDay: r.anchorDay };
    const endsOn = r.endsOn ? toDateInput(r.endsOn) : null;
    let date = toDateInput(r.nextRunOn);
    let runs = 0;
    let stop = false;
    while (date <= today && runs < MAX_CATCH_UP) {
      if (endsOn && date > endsOn) {
        stop = true;
        break;
      }
      try {
        const e = await createExpense(
          r.createdById,
          {
            ...(r.groupId ? { groupId: r.groupId } : { friendId: r.friendId! }),
            description: r.description,
            amountCents: r.amountCents,
            paidById: r.paidById,
            date,
            category: r.category,
            notes: r.notes ?? undefined,
            split: { method: r.splitMethod, entries: r.splitEntries },
          },
          { recurringId: r.id, recurrenceKey: `${r.id}:${date}`, currency: r.currency },
        );
        created++;
        await notifyExpenseCreated(e.id, "", { recurring: true });
      } catch (error) {
        const duplicate = typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
        if (!duplicate) {
          const reason = error instanceof AppError ? error.message : "Something went wrong creating this expense.";
          if (!(error instanceof AppError)) console.error("[recurring] failed", r.id, error);
          await db.recurringExpense.update({ where: { id: r.id }, data: { pausedAt: new Date(), lastError: reason } });
          paused++;
          stop = false;
          date = "";
          break;
        }
      }
      runs++;
      date = nextOccurrence(schedule, date);
    }
    if (!date) continue; // paused on error
    const finished = stop || (endsOn !== null && date > endsOn);
    await db.recurringExpense.update({
      where: { id: r.id },
      data: {
        nextRunOn: fromDateInput(date),
        lastRunOn: fromDateInput(today),
        ...(finished ? { stoppedAt: new Date() } : {}),
      },
    });
  }
  return { schedules: due.length, created, paused };
}
