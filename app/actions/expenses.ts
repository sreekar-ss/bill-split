"use server";

import { after } from "next/server";
import { deleteExpense, saveExpense, updateExpense } from "@/lib/server/expenses";
import { NOTIFY_PER_MINUTE, notifyExpenseCreated } from "@/lib/server/notifications";
import { hit } from "@/lib/server/rate-limit";
import { saveRecurringExpense } from "@/lib/server/recurring";
import type { ExpenseInput, RecurrenceInput } from "@/lib/validation";
import { authed } from "./run";

/**
 * Create an expense. With `recurrence`, it also repeats weekly/monthly (this is the first occurrence).
 * Participants get a push notification after the response is sent: only when this call saved the
 * expense (not on a re-send of the same clientId), and at most NOTIFY_PER_MINUTE a minute per person.
 */
export async function createExpenseAction(input: ExpenseInput, recurrence?: RecurrenceInput) {
  return authed(async (user) => {
    const e = recurrence
      ? await saveRecurringExpense(user.id, input, recurrence).then((r) => ({ id: r.expenseId, recurringId: r.recurringId, created: r.created }))
      : await saveExpense(user.id, input).then((x) => ({ id: x.id, recurringId: undefined as string | undefined, created: x.created }));
    if (e.created) {
      // Only the notification is limited: the expense is already saved either way.
      after(async () => {
        const { count } = await hit(`notify:${user.id}`, 60_000);
        if (count <= NOTIFY_PER_MINUTE) await notifyExpenseCreated(e.id, user.id);
      });
    }
    return { id: e.id, recurringId: e.recurringId };
  });
}

export async function updateExpenseAction(expenseId: string, input: ExpenseInput) {
  return authed(async (user) => {
    await updateExpense(user.id, expenseId, input);
  });
}

export async function deleteExpenseAction(expenseId: string) {
  return authed((user) => deleteExpense(user.id, expenseId));
}
