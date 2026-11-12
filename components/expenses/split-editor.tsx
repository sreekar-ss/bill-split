"use client";

import { CircleAlert, Check } from "lucide-react";
import { Checkbox } from "radix-ui";
import { useId } from "react";
import { Segmented } from "@/components/ui/segmented";
import { formatMoney, type Cents } from "@/lib/domain/money";
import type { SplitMethod } from "@/lib/domain/splits";
import { cn } from "@/lib/utils/cn";
import { currencySymbol } from "./categories";
import type { SplitDraft, ValueMethod } from "./split-math";

export interface Participant {
  id: string;
  name: string;
}

const METHOD_OPTIONS: { value: SplitMethod; label: string }[] = [
  { value: "equal", label: "Equally" },
  { value: "exact", label: "Exact" },
  { value: "percentage", label: "Percent" },
  { value: "shares", label: "Shares" },
];

const HINTS: Record<SplitMethod, string> = {
  equal: "Untick anyone who isn't sharing this.",
  exact: "Enter what each person owes.",
  percentage: "Percentages need to add up to 100.",
  shares: "Give bigger shares to people who had more, like 2 for a couple.",
};

export function SplitEditor({
  participants,
  meId,
  currency,
  draft,
  preview,
  invalid,
  error,
  onMethodChange,
  onToggle,
  onValueChange,
}: {
  participants: Participant[];
  meId: string;
  currency: string;
  draft: SplitDraft;
  preview: Map<string, Cents>;
  invalid: Set<string>;
  error?: string;
  onMethodChange: (method: SplitMethod) => void;
  onToggle: (userId: string, included: boolean) => void;
  onValueChange: (method: ValueMethod, userId: string, text: string) => void;
}) {
  const labelId = useId();
  const hintId = useId();
  const { method } = draft;
  const symbol = currencySymbol(currency);

  return (
    <fieldset className="min-w-0" aria-describedby={hintId}>
      <legend id={labelId} className="mb-1.5 text-body-sm font-semibold text-ink">
        Split
      </legend>
      <Segmented label="Split method" value={method} onValueChange={onMethodChange} options={METHOD_OPTIONS} className="[&>button]:h-11" />
      <p id={hintId} className="mt-2 text-meta text-ink-muted">
        {HINTS[method]}
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-meta font-medium text-owe">
          {error}
        </p>
      ) : null}

      <ul className="mt-1">
        {participants.map((p) => {
          const isMe = p.id === meId;
          const name = isMe ? "You" : p.name;
          const on = Boolean(draft.included[p.id]);
          const amount = preview.get(p.id);
          const possessive = isMe ? "Your" : `${p.name}'s`;
          return (
            <li key={p.id} className="grid min-h-[56px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2 border-b border-rule py-1.5">
              <Checkbox.Root
                checked={on}
                onCheckedChange={(v) => onToggle(p.id, v === true)}
                aria-label={`Include ${isMe ? "you" : p.name}`}
                className="group grid size-11 place-items-center rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
              >
                <span
                  className={cn(
                    "grid size-[22px] place-items-center rounded-[6px] border-[1.5px] border-field",
                    "group-data-[state=checked]:border-ink group-data-[state=checked]:bg-ink group-data-[state=checked]:text-surface",
                  )}
                >
                  <Checkbox.Indicator>
                    <Check className="size-[15px]" strokeWidth={3} aria-hidden />
                  </Checkbox.Indicator>
                </span>
              </Checkbox.Root>

              <span className="min-w-0">
                <span className={cn("block truncate font-medium", !on && "text-ink-muted")}>{name}</span>
                {method === "percentage" || method === "shares" ? (
                  <span className="num block text-meta text-ink-muted" aria-live="off">
                    {on ? (amount !== undefined ? formatMoney(amount, currency) : "—") : "not included"}
                  </span>
                ) : !on ? (
                  <span className="block text-meta text-ink-muted">not included</span>
                ) : null}
              </span>

              {method === "equal" ? (
                <span className={cn("num min-w-[84px] text-right font-semibold", !on && "text-ink-muted")}>
                  {on && amount !== undefined ? formatMoney(amount, currency) : on ? "—" : formatMoney(0, currency)}
                </span>
              ) : (
                <span className="relative block w-[116px]">
                  {method === "exact" ? (
                    <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">
                      {symbol}
                    </span>
                  ) : null}
                  <input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={!on}
                    value={on ? (draft[method][p.id] ?? "") : ""}
                    placeholder={method === "shares" ? "1" : "0"}
                    onChange={(e) => onValueChange(method, p.id, e.target.value)}
                    aria-label={
                      method === "exact" ? `${possessive} share in ${currency}` : method === "percentage" ? `${possessive} percentage` : `${possessive} shares`
                    }
                    aria-invalid={invalid.has(p.id) || undefined}
                    className={cn(
                      "num h-11 w-full rounded-[10px] border border-field bg-surface text-right font-semibold text-ink placeholder:font-normal placeholder:text-ink-muted",
                      "focus-visible:border-focus focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus aria-[invalid=true]:border-owe disabled:opacity-50",
                      method === "exact" ? "pl-7 pr-3" : method === "percentage" ? "pl-3 pr-8" : "px-3",
                    )}
                  />
                  {method === "percentage" ? (
                    <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">
                      %
                    </span>
                  ) : null}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/** Footer line: "$3.20 left to assign" / "All assigned" / percent total. */
export function SplitStatusLine({ status }: { status: { tone: "ok" | "error" | "muted"; message: string; detail?: string } }) {
  return (
    <div className="mb-3 flex min-h-6 items-center justify-between gap-3 text-body-sm" aria-live="polite">
      <span className={cn("inline-flex min-w-0 items-center gap-1.5", status.tone === "error" ? "font-bold text-owe" : "text-ink-muted")}>
        {status.tone === "ok" ? <Check className="size-4 shrink-0" aria-hidden /> : null}
        {status.tone === "error" ? <CircleAlert className="size-4 shrink-0" aria-hidden /> : null}
        <span className="num">{status.message}</span>
      </span>
      {status.detail ? <span className="num shrink-0 text-ink-muted">{status.detail}</span> : null}
    </div>
  );
}
