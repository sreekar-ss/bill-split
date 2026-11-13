/** Shared helpers for the spending pages. Months are "yyyy-mm" calendar months (UTC). */
import { formatDay, formatMonth, fromDateInput } from "@/lib/domain/dates";

export const PERIODS = [6, 12] as const;
export type Period = (typeof PERIODS)[number];

/** `?months=12` → 12; anything else → 6. */
export function parsePeriod(value: string | string[] | undefined): Period {
  return first(value) === "12" ? 12 : 6;
}

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function monthDate(month: string) {
  return fromDateInput(`${month}-01`);
}

/** "2026-06" → "Jun". */
export function monthShort(month: string): string {
  return formatDay(monthDate(month), { month: "short" });
}

/** "2026-06" → "June 2026". */
export function monthLong(month: string): string {
  return formatMonth(monthDate(month));
}

/** "Your share in the last 6 months" style period phrase. */
export function periodPhrase(months: number): string {
  return months === 1 ? "this month" : `the last ${months} months`;
}

/** Whole-number percentage of a total, never "0%" for a non-zero part. */
export function percentOf(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  const pct = Math.round((part / total) * 100);
  return pct === 0 ? "<1%" : `${pct}%`;
}

/** Builds a query string for the spending pages, leaving out defaults. */
export function insightsHref(path: string, params: { months?: Period; currency?: string }): string {
  const q = new URLSearchParams();
  if (params.months && params.months !== 6) q.set("months", String(params.months));
  if (params.currency) q.set("currency", params.currency);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}
