"use client";

import { useState } from "react";
import { RemindButton } from "@/components/notifications/remind-button";
import { SettleUpSheet, type SettleUpSheetProps } from "@/components/payments/settle-up-sheet";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";
import { displayName, isInvited } from "@/lib/utils/person";
import { paysSentence, type NamedPerson } from "./format";

export interface PlanStep {
  from: NamedPerson;
  to: NamedPerson;
  amountCents: number;
}

type Prefill = { fromId?: string; toId?: string; amountCents?: number };

/** The simplified "who pays whom" list, each step opening the settle-up sheet prefilled from it. */
export function SettlePlan({
  groupId,
  plan,
  people,
  meId,
  currency,
  paymentNote,
  readOnly = false,
}: {
  groupId: string;
  plan: PlanStep[];
  /**
   * Current members: the only people a payment can be recorded between. Pass the plain name plus
   * `status`; the sheet labels them (displayName: "Ben (invited)") and reads the payment handles.
   */
  people: SettleUpSheetProps["people"];
  meId: string;
  currency: string;
  /** Prefilled note in the payee's payment app (the group name). */
  paymentNote?: string;
  /** Archived group: show the plan, with no Record payment or Remind actions. */
  readOnly?: boolean;
}) {
  const [sheet, setSheet] = useState<{ open: boolean; prefill: Prefill }>({ open: false, prefill: {} });
  const memberIds = new Set(people.map((p) => p.id));
  const canRecord = people.length >= 2 && !readOnly;

  return (
    <>
      {plan.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Everyone is settled up.</p>
      ) : (
        <>
          <p className="text-meta text-ink-muted">
            {plan.length === 1 ? "1 payment settles everyone." : `${plan.length} payments settle everyone.`}
          </p>
          <ul className="mt-1">
            {plan.map((step) => {
              const toMe = step.to.id === meId;
              const fromMe = step.from.id === meId;
              const recordable = !readOnly && memberIds.has(step.from.id) && memberIds.has(step.to.id);
              // Only the person being paid can nudge the payer. Deleted accounts and invited
              // placeholders have no inbox to remind.
              const remindable = toMe && recordable && step.from.status !== "deleted" && !isInvited(step.from);
              return (
                <li
                  key={`${step.from.id}-${step.to.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 border-b border-rule py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-body-sm">{paysSentence(step.from, step.to, meId)}</span>
                    <span className="flex flex-wrap items-center gap-x-1">
                      <span
                        className={cn(
                          "num block text-[1.125rem] font-bold tracking-[-0.01em]",
                          toMe ? "text-owed" : fromMe ? "text-owe" : "text-ink",
                        )}
                      >
                        {formatMoney(step.amountCents, currency)}
                      </span>
                      {/* A nudge sits with the sentence; Record payment stays the one outlined action per row. */}
                      {remindable ? <RemindButton toUserId={step.from.id} toName={displayName(step.from)} groupId={groupId} className="px-3" /> : null}
                    </span>
                  </span>
                  {recordable ? (
                    <Button
                      variant="secondary"
                      className="shrink-0"
                      aria-label={`Record payment: ${paysSentence(step.from, step.to, meId)} ${formatMoney(step.amountCents, currency)}`}
                      onClick={() =>
                        setSheet({ open: true, prefill: { fromId: step.from.id, toId: step.to.id, amountCents: step.amountCents } })
                      }
                    >
                      Record payment
                    </Button>
                  ) : readOnly ? null : (
                    <span className="text-meta text-ink-muted">left the group</span>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {canRecord ? (
        <Button variant="ghost" className="-ml-4 mt-2" onClick={() => setSheet({ open: true, prefill: {} })}>
          {plan.length ? "Record a different payment" : "Record a payment"}
        </Button>
      ) : null}
      {readOnly ? null : (
        <SettleUpSheet
          open={sheet.open}
          onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
          context={{ groupId }}
          people={people}
          meId={meId}
          currency={currency}
          defaultFromId={sheet.prefill.fromId}
          defaultToId={sheet.prefill.toId}
          defaultAmountCents={sheet.prefill.amountCents}
          paymentNote={paymentNote}
        />
      )}
    </>
  );
}
