"use client";

import { createContext, useContext } from "react";
import type { ExpenseDetail } from "@/lib/server/expenses";

export interface AddExpensePreset {
  groupId?: string;
  friendId?: string;
}

export interface AddExpenseApi {
  /** Open the add-expense sheet, optionally pre-selecting a group or friend. */
  openAddExpense: (preset?: AddExpensePreset) => void;
  /** Open the same sheet in edit mode for an existing expense. */
  openEditExpense: (expense: ExpenseDetail) => void;
  /** False when the user has no groups or friends yet (nothing to split with). */
  canAddExpense: boolean;
}

export const AddExpenseContext = createContext<AddExpenseApi | null>(null);

export function useAddExpense(): AddExpenseApi {
  const ctx = useContext(AddExpenseContext);
  if (!ctx) throw new Error("useAddExpense must be used inside <AppShell>");
  return ctx;
}
