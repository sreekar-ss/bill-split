"use client";

import { Plus, UserPlus } from "lucide-react";
import { useState } from "react";
import { useAddExpense } from "@/components/shell/add-expense-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/page";
import { AddMemberSheet } from "./add-member-form";

/** The group ledger before anything is recorded. A group of one needs a member before an expense makes sense. */
export function EmptyLedger({ groupId, groupName, alone }: { groupId: string; groupName: string; alone: boolean }) {
  const { openAddExpense } = useAddExpense();
  const [adding, setAdding] = useState(false);

  if (alone) {
    return (
      <>
        <EmptyState
          title="No expenses yet"
          body="It's just you here so far. Add a member, then log the first expense and we'll keep the tally."
          action={
            <Button onClick={() => setAdding(true)}>
              <UserPlus aria-hidden />
              Add member
            </Button>
          }
        />
        <AddMemberSheet open={adding} onOpenChange={setAdding} groupId={groupId} groupName={groupName} />
      </>
    );
  }

  return (
    <EmptyState
      title="No expenses yet"
      body="Add the first one and we'll keep the tally."
      action={
        <Button onClick={() => openAddExpense({ groupId })}>
          <Plus aria-hidden />
          Add expense
        </Button>
      }
    />
  );
}
