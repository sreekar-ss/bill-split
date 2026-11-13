import { Money } from "@/components/ui/money";
import { formatMoney, type Cents } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";

export interface CurrencySpend {
  currency: string;
  /** Oldest first; the last point is the current month. */
  monthly: { month: string; cents: Cents }[];
}

/**
 * Home's compact "Your spending" tile: this month's share as the figure, last month as context and a
 * small run of monthly columns (decorative; the figures are in the text). Other currencies get one
 * line each. The page links to /insights for the full breakdown.
 */
export function SpendingEntry({ spends }: { spends: CurrencySpend[] }) {
  const [main, ...others] = spends;
  // Other currencies only when there is something this month.
  const rest = others.filter((s) => (s.monthly.at(-1)?.cents ?? 0) > 0);
  if (!main) return null;
  const thisMonth = main.monthly.at(-1)?.cents ?? 0;
  const lastMonth = main.monthly.at(-2)?.cents ?? 0;
  const max = Math.max(1, ...main.monthly.map((m) => m.cents));
  return (
    <div className="border-y border-rule py-3">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-body-sm text-ink-muted">Your share this month{rest.length > 0 ? ` in ${main.currency}` : ""}</p>
          <p className="mt-0.5 text-title font-bold">
            <Money cents={thisMonth} currency={main.currency} />
          </p>
          <p className="text-meta text-ink-muted">
            Last month <span className="num">{formatMoney(lastMonth, main.currency)}</span>
          </p>
        </div>
        <span className="flex h-10 shrink-0 items-end gap-[3px]" aria-hidden>
          {main.monthly.map((m, i) => (
            <span
              key={m.month}
              className={cn("block w-2 rounded-t-[2px]", i === main.monthly.length - 1 ? "bg-ink" : "bg-ink-muted/60")}
              style={{ height: m.cents > 0 ? `max(${(m.cents / max) * 100}%, 2px)` : "1px" }}
            />
          ))}
        </span>
      </div>
      {rest.map((s) => (
        <p key={s.currency} className="mt-2 border-t border-rule pt-2 text-body-sm text-ink-muted">
          In {s.currency} this month <Money cents={s.monthly.at(-1)?.cents ?? 0} currency={s.currency} className="font-semibold text-ink" />
        </p>
      ))}
    </div>
  );
}
