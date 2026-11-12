import { Money } from "@/components/ui/money";
import { Panel } from "@/components/ui/page";
import type { Cents } from "@/lib/domain/money";

export interface CurrencySummary {
  currency: string;
  netCents: Cents;
  owedToMeCents: Cents;
  iOweCents: Cents;
}

/**
 * DESIGN.md summary panel: the net as the hero figure, with "You're owed" / "You owe" side by side.
 * Amounts in different currencies are never added up (no FX). The default currency comes first and
 * gets the full layout; any other currency is one line underneath. Most people only ever see one.
 */
export function SummaryPanel({ totals, currency }: { totals: CurrencySummary[]; currency: string }) {
  if (totals.length === 0) {
    return (
      <Panel role="region" aria-label="Your balance">
        <p className="text-title font-bold">You&apos;re all settled up</p>
        <p className="mt-1 text-body-sm text-ink-muted">Nobody owes anybody right now.</p>
        <Figures summary={{ currency, netCents: 0, owedToMeCents: 0, iOweCents: 0 }} />
      </Panel>
    );
  }

  const [first, ...rest] = totals;
  const multi = rest.length > 0;
  return (
    <Panel role="region" aria-label="Your balance">
      <p className="text-body-sm font-semibold text-ink-muted">{label(first, multi)}</p>
      <p className="mt-1 leading-[1.15]">
        <Money cents={first.netCents} currency={first.currency} tone="signed" className="hero-figure text-hero" />
      </p>
      <Figures summary={first} />
      {/* Other currencies stay compact so the People beam is still on the first screen of a phone. */}
      {rest.map((t) => (
        <p key={t.currency} className="mt-4 border-t border-rule pt-4 text-body-sm">
          <span className="font-semibold text-ink-muted">{label(t, true)}</span>{" "}
          <Money cents={t.netCents} currency={t.currency} tone="signed" className="font-bold" />
        </p>
      ))}
    </Panel>
  );
}

function label(t: CurrencySummary, multi: boolean) {
  const words = t.netCents > 0 ? "you're owed" : t.netCents < 0 ? "you owe" : "it evens out";
  return multi ? `In ${t.currency}, ${words}` : `Overall, ${words}`;
}

function Figures({ summary }: { summary: CurrencySummary }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-rule pt-4">
      <div>
        <dt className="text-body-sm text-ink-muted">You&apos;re owed</dt>
        <dd className="mt-0.5 text-title font-bold">
          <Money cents={summary.owedToMeCents} currency={summary.currency} tone="signed" />
        </dd>
      </div>
      <div>
        <dt className="text-body-sm text-ink-muted">You owe</dt>
        <dd className="mt-0.5 text-title font-bold">
          <Money cents={-summary.iOweCents} currency={summary.currency} tone="signed" />
        </dd>
      </div>
    </dl>
  );
}
