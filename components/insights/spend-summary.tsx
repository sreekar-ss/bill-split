import { Money } from "@/components/ui/money";
import { Panel } from "@/components/ui/page";
import { fullMonthAverage } from "@/lib/domain/insights";
import type { Cents } from "@/lib/domain/money";

/**
 * The hero figure for a spending page: the period total, with this month and the monthly average
 * and a typical month (fullMonthAverage) side by side underneath (same layout as Home's summary panel). Plain ink: spending isn't a balance.
 */
export function SpendSummary({
  label,
  totalCents,
  currency,
  monthly,
}: {
  label: string;
  totalCents: Cents;
  currency: string;
  monthly: { month: string; cents: Cents }[];
}) {
  const thisMonth = monthly.at(-1)?.cents ?? 0;
  const typical = fullMonthAverage(monthly);
  return (
    <Panel role="region" aria-label={label}>
      <p className="text-body-sm font-semibold text-ink-muted">{label}</p>
      <p className="mt-1 min-w-0 leading-[1.15] [overflow-wrap:anywhere]">
        <Money cents={totalCents} currency={currency} className="hero-figure text-[clamp(1.75rem,9vw,2.5rem)] md:text-hero" />
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-rule pt-4">
        <div>
          <dt className="text-body-sm text-ink-muted">This month so far</dt>
          <dd className="mt-0.5 text-title font-bold">
            <Money cents={thisMonth} currency={currency} />
          </dd>
        </div>
        <div>
          <dt className="text-body-sm text-ink-muted">{typical.label}</dt>
          <dd className="mt-0.5 text-title font-bold">
            <Money cents={typical.cents} currency={currency} />
          </dd>
          {typical.since ? <dd className="mt-0.5 text-meta text-ink-muted">Since {typical.since}</dd> : null}
        </div>
      </dl>
    </Panel>
  );
}
