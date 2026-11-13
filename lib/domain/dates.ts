/**
 * Expense/payment dates are calendar dates (no time-of-day). They're stored as UTC noon so
 * that no timezone can shift them to a neighbouring day, and always read back in UTC.
 */
export function fromDateInput(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function toDateInput(date: Date | string): string {
  return new Date(date).toISOString().slice(0, 10);
}

/** Today's date in the *local* timezone as yyyy-mm-dd (for form defaults). */
export function todayInput(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatDay(date: Date | string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(date));
}

/** "June 2026": the (UTC) calendar month a date falls in. */
export function formatMonth(date: Date | string): string {
  return formatDay(date, { month: "long", year: "numeric" });
}
