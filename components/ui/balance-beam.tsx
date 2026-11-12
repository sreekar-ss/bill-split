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
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.cents)));
  const sorted = [...rows].sort((a, b) => b.cents - a.cents);
  return (
    <ul aria-label={label} className={cn("space-y-3", className)}>
      {sorted.map((r) => {
        const pct = (Math.abs(r.cents) / max) * 50;
        const words =
          r.cents > 0 ? (r.phrase?.positive ?? "gets back") : r.cents < 0 ? (r.phrase?.negative ?? "owes") : "settled up";
        const Row = r.href ? "a" : "div";
        return (
          <li key={r.id}>
            <Row href={r.href} className={cn("block rounded-[6px]", r.href && "hover:bg-ink/[0.03] -mx-1 px-1")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate font-semibold">{r.name}</span>
                <span className={cn("shrink-0 text-body-sm", r.cents > 0 ? "text-owed" : r.cents < 0 ? "text-owe" : "text-ink-muted")}>
                  {words}
                  {r.cents !== 0 && <span className="num ml-1 font-bold">{formatMoney(r.cents, currency, { abs: true })}</span>}
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
            </Row>
          </li>
        );
      })}
    </ul>
  );
}
