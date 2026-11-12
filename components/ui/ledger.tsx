import Link from "next/link";
import { formatDay } from "@/lib/domain/dates";
import { formatMoney, type Cents } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";

/** Month abbreviation over day number (UTC calendar date). Screen readers get the date as one phrase. */
export function DateBlock({ date }: { date: Date | string }) {
  const d = new Date(date);
  return (
    <span className="w-10 shrink-0">
      <span className="flex flex-col items-center leading-none text-ink-muted" aria-hidden>
        <span className="text-meta">{new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(d)}</span>
        <span className="num mt-0.5 text-[1.25rem] font-semibold text-ink">{d.getUTCDate()}</span>
      </span>
      <span className="sr-only">{formatDay(d)},</span>
    </span>
  );
}

/** A ledger row: leading (date/avatar/icon) · title + meta · trailing amount column. ≥ 64px tall, divided by rules. */
export function LedgerRow({
  leading,
  title,
  meta,
  trailing,
  href,
  onClick,
  className,
}: {
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      {leading}{" "}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title} </span>
        {meta ? <span className="block truncate text-meta text-ink-muted"> {meta}</span> : null}
      </span>
      {" "}
      {trailing ? <span className="min-w-[84px] shrink-0 text-right">{trailing}</span> : null}
    </>
  );
  const cls = cn("flex min-h-16 w-full items-center gap-3 border-b border-rule py-2.5 text-left", (href || onClick) && "hover:bg-ink/[0.03]", className);
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** The viewer's stake in an expense: "you lent $X" / "you borrowed $X" / "not involved". */
export function StakeLabel({ cents, currency = "USD", involved = true }: { cents: Cents; currency?: string; involved?: boolean }) {
  if (!involved) return <span className="text-meta text-ink-muted">not involved</span>;
  if (cents === 0) return <span className="text-meta text-ink-muted">no balance</span>;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className={cn("text-meta", cents > 0 ? "text-owed" : "text-owe")}>{cents > 0 ? "you lent" : "you borrowed"} </span>
      <span className={cn("num font-bold", cents > 0 ? "text-owed" : "text-owe")}>{formatMoney(cents, currency, { abs: true })}</span>
    </span>
  );
}

/** Payment rows use muted label + plain ink amount (DESIGN.md). */
export function PaymentLabel({ cents, currency = "USD" }: { cents: Cents; currency?: string }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className="text-meta text-ink-muted">payment </span>
      <span className="num font-bold">{formatMoney(cents, currency)}</span>
    </span>
  );
}

export function MonthHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="pb-1 pt-5 text-body-sm font-semibold text-ink-muted first:pt-0">{children}</h3>;
}
