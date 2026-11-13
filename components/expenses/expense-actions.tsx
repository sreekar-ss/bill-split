"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteExpenseAction } from "@/app/actions/expenses";
import { lowerFirst } from "@/components/recurring/format";
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
  // Deleting one occurrence doesn't stop the schedule; say so, and point to the control that does.
  const repeating = expense.recurring && expense.recurring.state !== "stopped" ? expense.recurring : null;

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
        body={
          <>
            “{expense.description}” will be removed for everyone on it, and balances will update. This can&apos;t be undone.
            {repeating ? (
              <span className="mt-2 block">
                {repeating.state === "paused"
                  ? "This deletes only this one. Its schedule stays, paused. To end it, use Stop repeating."
                  : `This deletes only this one. It keeps repeating ${lowerFirst(repeating.schedule)}. To stop future ones, use Stop repeating.`}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Delete expense"
        pending={pending}
        onConfirm={remove}
      />
    </div>
  );
}
