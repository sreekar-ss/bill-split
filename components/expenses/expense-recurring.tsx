"use client";

import { CircleStop, Pause, Play, Repeat } from "lucide-react";
import { useState } from "react";
import { asSentence, PAUSED_FIX, shortDate } from "@/components/recurring/format";
import { STOP_CONFIRM, useRecurringActions } from "@/components/recurring/use-recurring-actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { ExpenseDetail } from "@/lib/server/expenses";
import { cn } from "@/lib/utils/cn";

type Recurring = NonNullable<ExpenseDetail["recurring"]>;

const BUSY = "aria-disabled:cursor-default aria-disabled:opacity-60";

/** The "Repeats" row on the expense page: the schedule, what happens next, and its controls. */
export function ExpenseRecurring({ recurring, description }: { recurring: Recurring; description: string }) {
  const { pending, working, pause, resume, stop } = useRecurringActions(recurring.id);
  const [confirming, setConfirming] = useState(false);

  const { state, schedule, nextRunOn, endsOn } = recurring;
  // The daily job marks a schedule stopped once it passes its end date; until then, say it's done.
  const ended = state === "active" && endsOn !== null && nextRunOn > endsOn;

  let status: React.ReactNode;
  if (state === "stopped") status = "Stopped. Past expenses stay; no new ones will be added.";
  else if (ended && endsOn) status = <>Ended on <span className="num">{shortDate(endsOn)}</span>.</>;
  else if (state === "paused")
    status = recurring.lastError
      ? `Paused: ${asSentence(recurring.lastError)} ${PAUSED_FIX}`
      : "Paused. No new expenses are added until it's resumed.";
  else
    status = (
      <>
        Next on <span className="num">{shortDate(nextRunOn)}</span>
        {endsOn ? (
          <>
            , ends <span className="num">{shortDate(endsOn)}</span>
          </>
        ) : null}
        .
      </>
    );

  const manageable = state !== "stopped" && !ended;

  return (
    <div className="mt-4 border-t border-rule pt-4" aria-busy={pending || undefined}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-full",
            state === "active" && !ended ? "bg-ink/[0.06] text-ink" : "border border-dashed border-field text-ink-muted",
          )}
        >
          {state === "paused" ? <Pause className="size-4" /> : <Repeat className="size-4" />}
        </span>
        <div className="min-w-0 text-body-sm">
          <p className="text-meta text-ink-muted">Repeats</p>
          <p className={cn("font-medium", state === "stopped" && "text-ink-muted line-through decoration-ink-muted/60")}>{schedule}</p>
          <p className="mt-0.5 text-meta text-ink-muted" aria-live="polite">
            {working === "pause" ? "Pausing…" : working === "resume" ? "Resuming…" : working === "stop" ? "Stopping…" : status}
          </p>
        </div>
      </div>

      {manageable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {/* aria-disabled (not disabled) while working, so keyboard focus stays on the button as it
              changes between Pause and Resume. */}
          {state === "paused" ? (
            <Button variant="secondary" aria-disabled={pending || undefined} className={BUSY} onClick={() => !pending && resume()}>
              <Play aria-hidden />
              {working === "resume" ? "Resuming…" : "Resume"}
            </Button>
          ) : (
            <Button variant="secondary" aria-disabled={pending || undefined} className={BUSY} onClick={() => !pending && pause()}>
              <Pause aria-hidden />
              {working === "pause" ? "Pausing…" : "Pause"}
            </Button>
          )}
          <Button variant="destructive" aria-disabled={pending || undefined} className={BUSY} onClick={() => !pending && setConfirming(true)}>
            <CircleStop aria-hidden />
            Stop repeating
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !pending && setConfirming(open)}
        title={STOP_CONFIRM.titleFor(description)}
        body={STOP_CONFIRM.body}
        confirmLabel={STOP_CONFIRM.confirmLabel}
        pending={pending}
        onConfirm={() => stop(() => setConfirming(false))}
      />
    </div>
  );
}
