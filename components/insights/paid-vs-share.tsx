import { formatMoney, type Cents } from "@/lib/domain/money";

export interface PersonSpend {
  id: string;
  /** "You" for the viewer. */
  name: string;
  paidCents: Cents;
  shareCents: Cents;
}

/**
 * Per person, what they paid against what their share came to: two thin bars on one shared scale.
 * Two series, so there's a legend, and every bar also has its word and amount beside it.
 * Neutral inks only: green and crimson mean balances in this app, and this isn't a balance
 * (payments between people aren't counted here).
 */
export function PaidVsShare({ people, currency, meId }: { people: PersonSpend[]; currency: string; meId: string }) {
  const max = Math.max(1, ...people.flatMap((p) => [p.paidCents, p.shareCents]));
  return (
    <div>
      <ul className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-body-sm text-ink-muted" aria-label="Legend">
        <li className="flex items-center gap-2">
          <span className="block h-2 w-4 rounded-[2px] bg-ink" aria-hidden />
          Paid
        </li>
        <li className="flex items-center gap-2">
          <span className="block h-2 w-4 rounded-[2px] bg-ink-muted" aria-hidden />
          Share
        </li>
      </ul>
      <ul aria-label="Paid and share by person" className="divide-y divide-rule border-y border-rule">
        {people.map((p) => (
          <li key={p.id} className="py-3">
            <p className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="min-w-0 truncate font-semibold">{p.name}</span>
              <span className="text-meta text-ink-muted">{difference(p, currency, p.id === meId)}</span>
            </p>
            <div className="mt-2 grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-[2px]">
              <Bar term="Paid" cents={p.paidCents} max={max} currency={currency} className="bg-ink" />
              <Bar term="Share" cents={p.shareCents} max={max} currency={currency} className="bg-ink-muted" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bar({ term, cents, max, currency, className }: { term: string; cents: Cents; max: number; currency: string; className: string }) {
  return (
    <div className="contents">
      <span className="text-meta text-ink-muted">{term}</span>
      <span className="block h-2" aria-hidden>
        {cents > 0 ? <span className={`block h-2 rounded-r-[4px] ${className}`} style={{ width: `max(${(cents / max) * 100}%, 2px)` }} /> : null}
      </span>
      <span className="num text-right text-body-sm font-semibold">{formatMoney(cents, currency)}</span>
    </div>
  );
}

function difference(p: PersonSpend, currency: string, you: boolean): string {
  const diff = p.paidCents - p.shareCents;
  if (diff === 0) return you ? "You paid exactly your share" : "Paid exactly their share";
  const amount = formatMoney(diff, currency, { abs: true });
  const whose = you ? "your" : "their";
  return `${you ? "You paid" : "Paid"} ${amount} ${diff > 0 ? "more" : "less"} than ${whose} share`;
}
