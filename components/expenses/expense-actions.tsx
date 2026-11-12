"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteExpenseAction } from "@/app/actions/expenses";
import { useAddExpense } from "@/components/shell/add-expense-context";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ExpenseDetail } from "@/lib/server/expenses";
import { runAction } from "@/lib/client/run-action";

/** Edit / Delete for the expense detail page. */
export function ExpenseActions({ expense, backHref }: { expense: ExpenseDetail; backHref: string }) {
  const { openEditExpense } = useAddExpense();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await runAction(() => deleteExpenseAction(expense.id));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { groupId, friendId } = result.data;
      const href = groupId ? `/groups/${groupId}` : friendId ? `/friends/${friendId}` : backHref;
      toast.success("Expense deleted");
      router.push(href);
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => openEditExpense(expense)}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <Button variant="destructive" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden />
        Delete
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !pending && setConfirming(open)}
        title="Delete this expense?"
        body={`“${expense.description}” will be removed for everyone on it, and balances will update. This can't be undone.`}
        confirmLabel="Delete expense"
        pending={pending}
        onConfirm={remove}
      />
    </div>
  );
}
