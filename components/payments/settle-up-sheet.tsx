"use client";

// CONTRACT (owned by the groups feature; also used by friends pages). Keep these props stable.
import { Sheet } from "@/components/ui/sheet";

export interface SettleUpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the payment is recorded: a group, or directly with a friend. */
  context: { groupId: string } | { friendId: string };
  /** People who can be payer/receiver (group members, or [me, friend]). */
  people: { id: string; name: string }[];
  meId: string;
  currency: string;
  /** Prefill, usually from the settle-up plan. Amount may be edited (partial payments are fine). */
  defaultFromId?: string;
  defaultToId?: string;
  defaultAmountCents?: number;
}

export function SettleUpSheet({ open, onOpenChange }: SettleUpSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Record a payment">
      <p className="text-ink-muted">Settle-up form goes here.</p>
    </Sheet>
  );
}
