"use client";

// CONTRACT (owned by the expenses/recurring feature; used on group and friend pages). Keep props stable.
import { CircleStop, Ellipsis, Pause, Play, Repeat } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Money } from "@/components/ui/money";
import type { RecurringSummary } from "@/lib/server/recurring";
import { cn } from "@/lib/utils/cn";
import { displayName } from "@/lib/utils/person";
import { asSentence, PAUSED_FIX, shortDate } from "./format";
import { STOP_CONFIRM, useRecurringActions } from "./use-recurring-actions";

export interface RecurringListProps {
  /** From listRecurring(userId, { groupId } | { friendId }). Render nothing when empty. */
  items: RecurringSummary[];
  /** Archived group: list the schedules without their pause, resume and stop menu. */
  readOnly?: boolean;
}

/**
 * Schedules that keep adding expenses here, as ledger rows. The caller gives the section its
 * heading (e.g. <Section title="Repeating">). Each row has a menu to pause, resume or stop it.
 */
export function RecurringList({ items, readOnly = false }: RecurringListProps) {
  if (items.length === 0) return null;
  return (
    <ul className="border-t border-rule">
      {items.map((item) => (
        <RecurringRow key={item.id} item={item} readOnly={readOnly} />
      ))}
    </ul>
  );
}

const ITEM =
  "flex h-11 cursor-default select-none items-center gap-2.5 rounded-[7px] px-3 text-body-sm font-medium outline-none data-[highlighted]:bg-ink/5 data-[highlighted]:outline-2 data-[highlighted]:-outline-offset-2 data-[highlighted]:outline-focus data-[disabled]:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0";

function RecurringRow({ item, readOnly }: { item: RecurringSummary; readOnly: boolean }) {
  const { pending, working, pause, resume, stop } = useRecurringActions(item.id);
  const [confirming, setConfirming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // The stop confirmation opens once the menu has closed and handed focus back to its button,
  // so cancelling the dialog returns focus to that button rather than to a vanished menu item.
  const confirmAfterClose = useRef(false);

  const payer = item.paidByMe ? "You pay" : `${displayName(item.paidBy)} pays`;
  // Short sentences, not comma-joined fragments: "Every Friday. You pay. Ends Dec 18."
  const meta = `${[item.schedule, payer, item.endsOn ? `Ends ${shortDate(item.endsOn)}` : null].filter(Boolean).join(". ")}.`;
  // Past its end date but not yet marked stopped by the daily job.
  const ended = item.endsOn !== null && item.nextRunOn > item.endsOn;

  const status =
    working === "pause" ? "Pausing…" : working === "resume" ? "Resuming…" : working === "stop" ? "Stopping…" : item.paused ? "Paused" : ended ? "Ended" : null;

  return (
    <li className="border-b border-rule" aria-busy={pending || undefined}>
      <div className="flex min-h-16 items-center gap-3 py-2.5">
        <span
          aria-hidden
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            item.paused ? "border border-dashed border-field text-ink-muted" : "bg-ink/[0.06] text-ink",
          )}
        >
          {item.paused ? <Pause className="size-[18px]" /> : <Repeat className="size-[18px]" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{item.description}</span>
          <span className="block truncate text-meta text-ink-muted">{meta}</span>
        </span>

        <span className="flex shrink-0 flex-col items-end text-right leading-tight">
          <Money cents={item.amountCents} currency={item.currency} className="font-bold" />
          {status ? (
            <span className="mt-0.5 text-meta font-semibold text-ink-muted">{status}</span>
          ) : (
            <span className="mt-0.5 text-meta text-ink-muted">
              Next <span className="num">{shortDate(item.nextRunOn)}</span>
            </span>
          )}
        </span>

        {readOnly ? null : (
          <>
            {/* aria-disabled (not disabled) while an action runs: the menu hands focus back to this button
                on close, and a disabled button would drop it to <body>. */}
            <DropdownMenu.Root modal={false} open={menuOpen} onOpenChange={(open) => setMenuOpen(open && !pending)}>
              <DropdownMenu.Trigger
                aria-disabled={pending || undefined}
                aria-label={`Options for ${item.description}`}
                className="-mr-2 grid size-11 shrink-0 place-items-center rounded-[10px] text-ink-muted hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus aria-disabled:cursor-default aria-disabled:opacity-45 data-[state=open]:bg-ink/5"
              >
                <Ellipsis className="size-5" aria-hidden />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  collisionPadding={16}
                  onCloseAutoFocus={() => {
                    if (!confirmAfterClose.current) return;
                    confirmAfterClose.current = false;
                    setTimeout(() => setConfirming(true), 0);
                  }}
                  className="z-50 min-w-48 rounded-[10px] border border-rule bg-surface p-1 text-ink shadow-lift"
                >
                  {item.paused ? (
                    <DropdownMenu.Item className={ITEM} onSelect={() => resume()}>
                      <Play aria-hidden />
                      Resume
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item className={ITEM} onSelect={() => pause()}>
                      <Pause aria-hidden />
                      Pause
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    className={cn(ITEM, "text-owe")}
                    onSelect={() => {
                      confirmAfterClose.current = true;
                    }}
                  >
                    <CircleStop aria-hidden />
                    Stop repeating
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </>
        )}
      </div>

      {item.paused && item.lastError ? (
        <p className="-mt-1 mb-3 pl-[52px] text-meta text-ink">
          <span className="font-semibold">Paused:</span> {asSentence(item.lastError)} {PAUSED_FIX}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !pending && setConfirming(open)}
        title={STOP_CONFIRM.titleFor(item.description)}
        body={STOP_CONFIRM.body}
        confirmLabel={STOP_CONFIRM.confirmLabel}
        pending={pending}
        onConfirm={() => stop(() => setConfirming(false))}
      />
    </li>
  );
}
