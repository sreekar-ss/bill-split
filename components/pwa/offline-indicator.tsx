"use client";

import { ChevronDown, CircleAlert, CloudOff, CloudUpload } from "lucide-react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { centsToInput, formatMoney } from "@/lib/domain/money";
import type { QueuedExpense } from "@/lib/pwa/offline-queue";
import { cn } from "@/lib/utils/cn";
import { useOfflineSync } from "./offline-sync";

const count = (n: number) => `${n} ${n === 1 ? "expense" : "expenses"}`;

function statusText(online: boolean, waiting: number, failed: number): string {
  const parts: string[] = [];
  if (waiting > 0) parts.push(`${count(waiting)} waiting to sync.`);
  if (failed > 0) parts.push(`${count(failed)} couldn't be added.`);
  if (!online && !parts.length) parts.push("Expenses you add are saved on this device.");
  return parts.join(" ");
}

/** Where focus goes when the control that had it disappears (same pattern as ArchivedBanner). */
function focusHeading() {
  requestAnimationFrame(() => {
    const target = document.querySelector<HTMLElement>("#main h1");
    if (!target) return;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  });
}

/**
 * Quiet status line at the top of <main>: "You're offline" while the browser reports no connection,
 * and what's saved on this device: expenses waiting to be sent, and any the server refused. "Show"
 * lists them, each with Review (refused ones) or Remove. Nothing when all is well.
 * The status text is an always-mounted live region; the buttons sit outside it.
 */
export function OfflineIndicator() {
  const { online, items, waiting, failed, syncing, syncNow, review, discard } = useOfflineSync();
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const show = !online || items.length > 0;
  const text = show ? statusText(online, waiting, failed) : "";

  async function sync() {
    if (syncing) return;
    const left = await syncNow();
    // The whole banner (and this button) goes away once everything is sent.
    if (left === 0) focusHeading();
  }

  async function remove(item: QueuedExpense) {
    await discard(item);
    if (items.length > 1) toggleRef.current?.focus();
    else focusHeading();
  }

  return (
    <div data-testid="offline-indicator" className={cn(show && "mb-5 max-w-[720px] rounded-[10px] border border-rule bg-surface")}>
      <div className={cn(show && "flex flex-wrap items-center gap-x-3 py-1 pl-3 pr-1")}>
        {show ? (
          online ? (
            <CloudUpload className="size-[18px] shrink-0 text-ink-muted" aria-hidden />
          ) : (
            <CloudOff className="size-[18px] shrink-0 text-ink-muted" aria-hidden />
          )
        ) : null}
        <p role="status" aria-live="polite" className={cn(show ? "min-w-0 flex-1 py-2.5 text-body-sm text-ink" : "sr-only")}>
          {show && !online ? (
            <>
              <span className="font-semibold">You&apos;re offline.</span> <span className="text-ink-muted">{text}</span>
            </>
          ) : (
            text
          )}
        </p>
        {show ? (
          <div className="ml-auto flex shrink-0 items-center">
            {online && waiting > 0 ? (
              <button
                type="button"
                onClick={() => void sync()}
                aria-disabled={syncing || undefined}
                className="inline-flex h-11 items-center rounded-[10px] px-3 text-body-sm font-semibold text-ink underline underline-offset-4 hover:bg-ink/5 aria-disabled:opacity-60"
              >
                {syncing ? "Syncing…" : "Sync now"}
              </button>
            ) : null}
            {items.length > 0 ? (
              <button
                ref={toggleRef}
                type="button"
                aria-expanded={expanded}
                aria-controls={listId}
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex h-11 items-center gap-1 rounded-[10px] px-3 text-body-sm font-semibold text-ink hover:bg-ink/5"
              >
                {expanded ? "Hide" : "Show"}
                <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {show && expanded && items.length > 0 ? (
        <ul id={listId} aria-label="Saved on this device" className="border-t border-rule">
          {items.map((item) => (
            <QueuedRow key={item.clientId} item={item} onReview={() => review(item)} onRemove={() => void remove(item)} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function QueuedRow({ item, onReview, onRemove }: { item: QueuedExpense; onReview: () => void; onRemove: () => void }) {
  const { input, label, failed } = item;
  const amount = label ? formatMoney(input.amountCents, label.currency) : centsToInput(input.amountCents);
  const where = label ? ` ${label.where.charAt(0).toLowerCase()}${label.where.slice(1)}` : "";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule py-2 pl-3 pr-1 last:border-b-0">
      {failed ? (
        <CircleAlert className="size-[18px] shrink-0 text-owe" aria-hidden />
      ) : (
        <CloudUpload className="size-[18px] shrink-0 text-ink-muted" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold">{input.description}</p>
        <p className="text-meta text-ink-muted">
          <span className="num">{amount}</span>
          {where}
        </p>
        <p className={cn("text-meta", failed ? "text-owe" : "text-ink-muted")}>
          {failed ? `Couldn't add it: ${failed.error}` : "Waiting to sync"}
        </p>
      </div>
      <div className="ml-auto flex shrink-0 items-center">
        {failed ? (
          <Button variant="ghost" className="px-3" onClick={onReview} aria-label={`Review ${input.description}`}>
            Review
          </Button>
        ) : null}
        <Button variant="ghost" className="px-3" onClick={onRemove} aria-label={`Remove ${input.description}`}>
          Remove
        </Button>
      </div>
    </li>
  );
}
