import { AppLink } from "@/components/ui/app-link";
import { formatMoney, type Cents } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";

export interface BeamRow {
  id: string;
  /** Display name. Use "You" for the viewer. */
  name: string;
  /** + gets money back / is owed (right, green); − owes (left, crimson). */
  cents: Cents;
  /** Overrides the default words, e.g. "owes you" / "you owe". */
  phrase?: { positive: string; negative: string };
  href?: string;
  /** Overrides the beam's currency for this row (e.g. one person owing in two currencies). */
  currency?: string;
}

/**
 * The signature element (DESIGN.md): diverging bars centred on zero, one row per person,
 * scaled so the largest |amount| spans the half-width. Always paired with words, never colour alone.
 */
export function BalanceBeam({
  rows,
  currency = "USD",
  className,
  label = "Balances",
}: {
  rows: BeamRow[];
  currency?: string;
  className?: string;
  label?: string;
}) {
  // Bars are scaled within each currency: amounts in different currencies aren't comparable.
  const maxByCurrency = new Map<string, number>();
  for (const r of rows) {
    const c = r.currency ?? currency;
    maxByCurrency.set(c, Math.max(maxByCurrency.get(c) ?? 1, Math.abs(r.cents)));
  }
  const sorted = [...rows].sort((a, b) => b.cents - a.cents);
  return (
    <ul aria-label={label} className={cn("space-y-3", className)}>
      {sorted.map((r) => {
        const rowCurrency = r.currency ?? currency;
        const pct = (Math.abs(r.cents) / (maxByCurrency.get(rowCurrency) ?? 1)) * 50;
        const words =
          r.cents > 0 ? (r.phrase?.positive ?? "gets back") : r.cents < 0 ? (r.phrase?.negative ?? "owes") : "settled up";
        return (
          <li key={`${r.id}-${rowCurrency}`}>
            <RowShell href={r.href}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">
                  {r.name}{" "}
                </span>
                <span className={cn("shrink-0 text-body-sm", r.cents > 0 ? "text-owed" : r.cents < 0 ? "text-owe" : "text-ink-muted")}>
                  {words}
                  {r.cents !== 0 && " "}
                  {r.cents !== 0 && <span className="num font-bold">{formatMoney(r.cents, rowCurrency, { abs: true })}</span>}
                </span>
              </div>
              <div className="relative mt-1.5 h-2" aria-hidden>
                <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-rule" />
                <div className="absolute left-1/2 top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-ink-muted/60" />
                {r.cents !== 0 && (
                  <div
                    className={cn(
                      "animate-beam absolute top-0 h-2",
                      r.cents > 0 ? "left-1/2 origin-left rounded-r-[3px] bg-owed" : "right-1/2 origin-right rounded-l-[3px] bg-owe",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
            </RowShell>
          </li>
        );
      })}
    </ul>
  );
}

function RowShell({ href, children }: { href?: string; children: React.ReactNode }) {
  if (!href) return <div className="block rounded-[6px]">{children}</div>;
  return (
    <AppLink href={href} prefetch={false} className="-mx-1 block rounded-[6px] px-1 hover:bg-ink/[0.03]">
      {children}
    </AppLink>
  );
}
