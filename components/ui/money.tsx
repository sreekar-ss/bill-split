import { formatMoney, type Cents } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";

/** A money figure in tabular numerals. tone="signed" colours by sign (owed green / owe crimson). */
export function Money({
  cents,
  currency = "USD",
  tone = "plain",
  abs = tone === "signed",
  className,
}: {
  cents: Cents;
  currency?: string;
  tone?: "plain" | "signed";
  abs?: boolean;
  className?: string;
}) {
  const color = tone === "signed" ? (cents > 0 ? "text-owed" : cents < 0 ? "text-owe" : "text-ink-muted") : undefined;
  return <span className={cn("num", color, className)}>{formatMoney(cents, currency, { abs })}</span>;
}

/**
 * Balance in words, from the viewer's perspective (never colour alone).
 * cents > 0 → "{name} owes you $X" / "you're owed $X"; cents < 0 → "you owe {name} $X"; 0 → "settled up".
 */
export function balancePhrase(cents: Cents, currency: string, name?: string): string {
  const amt = formatMoney(cents, currency, { abs: true });
  if (cents > 0) return name ? `${name} owes you ${amt}` : `you're owed ${amt}`;
  if (cents < 0) return name ? `you owe ${name} ${amt}` : `you owe ${amt}`;
  return "settled up";
}

/** Short label + amount for list rows: "owes you" / "you owe" / "settled up". */
export function BalanceLabel({ cents, currency = "USD", className }: { cents: Cents; currency?: string; className?: string }) {
  if (cents === 0) return <span className={cn("text-body-sm text-ink-muted", className)}>settled up</span>;
  return (
    <span className={cn("flex flex-col items-end leading-tight", className)}>
      <span className={cn("text-meta", cents > 0 ? "text-owed" : "text-owe")}>{cents > 0 ? "owes you" : "you owe"} </span>
      <Money cents={cents} currency={currency} tone="signed" className="font-bold" />
    </span>
  );
}
