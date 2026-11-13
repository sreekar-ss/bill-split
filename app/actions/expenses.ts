"use server";

import { after } from "next/server";
import { createExpense, deleteExpense, updateExpense } from "@/lib/server/expenses";
import { notifyExpenseCreated } from "@/lib/server/notifications";
import { createRecurringExpense } from "@/lib/server/recurring";
import type { ExpenseInput, RecurrenceInput } from "@/lib/validation";
import { authed } from "./run";

/**
 * Create an expense. With `recurrence`, it also repeats weekly/monthly (this is the first occurrence).
 * Participants are emailed after the response is sent.
 */
export async function createExpenseAction(input: ExpenseInput, recurrence?: RecurrenceInput) {
  return authed(async (user) => {
    const e = recurrence
      ? await createRecurringExpense(user.id, input, recurrence).then((r) => ({ id: r.expenseId, recurringId: r.recurringId }))
      : await createExpense(user.id, input).then((x) => ({ id: x.id, recurringId: undefined as string | undefined }));
    after(() => notifyExpenseCreated(e.id, user.id));
    return e;
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
