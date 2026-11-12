"use server";

import { createExpense, deleteExpense, updateExpense } from "@/lib/server/expenses";
import type { ExpenseInput } from "@/lib/validation";
import { authed } from "./run";

export async function createExpenseAction(input: ExpenseInput) {
  return authed(async (user) => {
    const e = await createExpense(user.id, input);
    return { id: e.id };
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
