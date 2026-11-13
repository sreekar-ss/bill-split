import type { Cents } from "./money";

const monthName = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/**
 * A typical month: the average over *complete* months, starting with the first month that has any
 * spending (months before you joined, and the unfinished current month, would drag it down). With
 * fewer than two such months there's nothing to average, so it shows last month instead.
 */
export function fullMonthAverage(monthly: { month: string; cents: Cents }[]): { label: string; cents: Cents; since?: string } {
  const complete = monthly.slice(0, -1);
  const first = complete.findIndex((m) => m.cents > 0);
  const full = first === -1 ? [] : complete.slice(first);
  if (full.length < 2) return { label: "Last month", cents: complete.at(-1)?.cents ?? 0 };
  const sum = full.reduce((t, m) => t + m.cents, 0);
  return { label: "Average per full month", cents: Math.round(sum / full.length), since: monthName(full[0].month) };
}
