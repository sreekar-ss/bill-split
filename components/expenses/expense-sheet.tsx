"use client";

// CONTRACT (owned by the expenses feature): the shell renders exactly one of these.
import type { ExpenseDetail } from "@/lib/server/expenses";
import type { ExpenseContexts } from "@/lib/server/groups";
import { Sheet } from "@/components/ui/sheet";
import type { AddExpensePreset } from "@/components/shell/add-expense-context";

export interface ExpenseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contexts: ExpenseContexts;
  preset?: AddExpensePreset;
  /** When set, the sheet edits this expense instead of creating one. */
  editing?: ExpenseDetail;
}

export function ExpenseSheet({ open, onOpenChange, editing }: ExpenseSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={editing ? "Edit expense" : "Add expense"}>
      <p className="text-ink-muted">Expense form goes here.</p>
    </Sheet>
  );
}
