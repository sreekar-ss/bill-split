import { Money } from "@/components/ui/money";
import type { Cents } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";

/**
 * The viewer's net in a group, for the groups list: "you're owed" / "you owe" / "settled up".
 * (BalanceLabel says "owes you", which reads oddly next to a group's name.)
 */
export function GroupBalance({ cents, currency, className }: { cents: Cents; currency: string; className?: string }) {
  if (cents === 0) return <span className={cn("text-meta text-ink-muted", className)}>settled up</span>;
  return (
    <span className={cn("flex flex-col items-end leading-tight", className)}>
      <span className={cn("text-meta", cents > 0 ? "text-owed" : "text-owe")}>{cents > 0 ? "you're owed" : "you owe"} </span>
      <Money cents={cents} currency={currency} tone="signed" className="font-bold" />
    </span>
  );
}
