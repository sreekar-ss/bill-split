"use client";

import { useState } from "react";
import { SettleUpSheet, type SettleUpSheetProps } from "@/components/payments/settle-up-sheet";
import { Button } from "@/components/ui/button";
import { balancePhrase } from "@/components/ui/money";
import type { FriendDetail } from "@/lib/server/friends";

type Person = { id: string; name: string };
type Entry = FriendDetail["breakdown"][number];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function contextName(entry: Entry) {
  return entry.context.kind === "group" ? entry.context.name : "Direct expenses";
}

/** Direct balances can exist in several currencies, so the currency is part of the key. */
function contextKey(entry: Entry) {
  return entry.context.kind === "group" ? entry.context.groupId : `direct-${entry.context.currency}`;
}

/**
 * Explains the total with a friend, one line per context (each group, plus direct expenses), each
 * with its own "Settle up", because payments are recorded inside a context.
 */
export function BalanceBreakdown({ me, friend, breakdown }: { me: Person; friend: Person; breakdown: Entry[] }) {
  const [settling, setSettling] = useState<Entry | null>(null);
  const [open, setOpen] = useState(false);
  const entries = breakdown.filter((b) => b.cents !== 0);
  if (entries.length === 0) return null;

  const sheetProps = (entry: Entry): Omit<SettleUpSheetProps, "open" | "onOpenChange"> => {
    const friendPays = entry.cents > 0;
    return {
      context: entry.context.kind === "group" ? { groupId: entry.context.groupId } : { friendId: friend.id },
      people: [me, friend],
      meId: me.id,
      currency: entry.context.currency,
      defaultFromId: friendPays ? friend.id : me.id,
      defaultToId: friendPays ? me.id : friend.id,
      defaultAmountCents: Math.abs(entry.cents),
    };
  };

  return (
    <>
      <ul aria-label={`How your balance with ${friend.name} adds up`} className="mt-4 border-t border-rule">
        {entries.map((entry) => {
          const key = contextKey(entry);
          const sentence = capitalize(balancePhrase(entry.cents, entry.context.currency, friend.name));
          return (
            <li key={key} className="flex min-h-16 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-rule py-3 last:border-b-0">
              <p className="min-w-0 flex-1 text-body-sm">
                <span className="font-semibold">{contextName(entry)}:</span>{" "}
                <span className={entry.cents > 0 ? "text-owed" : "text-owe"}>{sentence}</span>
              </p>
              <Button
                variant={entries.length === 1 ? "primary" : "secondary"}
                aria-label={`Settle up in ${contextName(entry)}`}
                onClick={() => {
                  setSettling(entry);
                  setOpen(true);
                }}
              >
                Settle up
              </Button>
            </li>
          );
        })}
      </ul>
      {settling && <SettleUpSheet key={contextKey(settling)} open={open} onOpenChange={setOpen} {...sheetProps(settling)} />}
    </>
  );
}
