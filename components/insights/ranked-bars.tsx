import Link from "next/link";
import { formatMoney, type Cents } from "@/lib/domain/money";
import { percentOf } from "./format";

export interface RankedRow {
  key: string;
  label: string;
  cents: Cents;
  href?: string;
}

/**
 * Ranked horizontal bars (largest first, one hue) for a part-to-whole split: categories, groups.
 * Each row prints its name, amount and share of the total, so the bars are decoration for sighted
 * readers and the list itself is the text alternative.
 */
export function RankedBars({
  rows,
  currency,
  totalCents,
  label,
  limit,
  otherLabel = "Everything else",
}: {
  rows: RankedRow[];
  currency: string;
  totalCents: Cents;
  label: string;
  /** Fold rows past this many into one "Everything else" row. */
  limit?: number;
  otherLabel?: string;
}) {
  const sorted = [...rows].filter((r) => r.cents > 0).sort((a, b) => b.cents - a.cents);
  let shown = sorted;
  if (limit && sorted.length > limit) {
    const rest = sorted.slice(limit - 1);
    shown = [
      ...sorted.slice(0, limit - 1),
      { key: "__other", label: `${otherLabel} (${rest.length})`, cents: rest.reduce((s, r) => s + r.cents, 0) },
    ];
  }
  const max = Math.max(1, ...shown.map((r) => r.cents));

  return (
    <ul aria-label={label} className="space-y-1">
      {shown.map((r) => {
        const pct = percentOf(r.cents, totalCents);
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate font-medium">{r.label}</span>
              <span className="shrink-0 text-right">
                <span className="num font-semibold">{formatMoney(r.cents, currency)}</span>
                <span className="num ml-2 inline-block min-w-[3ch] text-meta text-ink-muted">
                  <span className="sr-only">, </span>
                  {pct}
                  <span className="sr-only"> of the total</span>
                </span>
              </span>
            </span>
            {/* Square at the baseline (left), 4px rounded data end. */}
            <span className="mt-1.5 block h-2" aria-hidden>
              <span className="block h-2 rounded-r-[4px] bg-ink" style={{ width: `max(${(r.cents / max) * 100}%, 2px)` }} />
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="-mx-2 block min-h-11 rounded-[6px] px-2 py-2 hover:bg-ink/[0.03]">
                {body}
              </Link>
            ) : (
              <div className="block min-h-11 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
