"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useAddExpense, type AddExpensePreset } from "@/components/shell/add-expense-context";
import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * Opens the shared add-expense sheet. When there's nobody to split with yet, it becomes a link to
 * create a group instead, so the empty state always offers a working next step.
 */
export function AddExpenseButton({
  preset,
  variant = "primary",
  className,
}: {
  preset?: AddExpensePreset;
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const { openAddExpense, canAddExpense } = useAddExpense();
  if (!canAddExpense) {
    return (
      <Button asChild variant={variant} className={className}>
        <Link href="/groups">Create a group</Link>
      </Button>
    );
  }
  return (
    <Button variant={variant} className={className} onClick={() => openAddExpense(preset)}>
      <Plus aria-hidden />
      Add expense
    </Button>
  );
}
