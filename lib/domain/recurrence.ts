/**
 * Recurring schedule math on calendar dates ("yyyy-mm-dd" strings, no time zones).
 * weekly: every `interval` weeks on `anchorDay` (0 = Sunday … 6 = Saturday)
 * monthly: every `interval` months on `anchorDay` (1–31), clamped to the month's last day,
 *          so "the 31st" means Jan 31, Feb 28/29, Mar 31, Apr 30 …
 */
export type Frequency = "weekly" | "monthly";

export interface Schedule {
  frequency: Frequency;
  interval: number;
  anchorDay: number;
}

const toUTC = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromUTC = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const daysInMonth = (y: number, m0: number) => new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();

/** The anchor day implied by a start date (its weekday or day of month). */
export function anchorFor(frequency: Frequency, startDate: string): number {
  const d = new Date(toUTC(startDate));
  return frequency === "weekly" ? d.getUTCDay() : d.getUTCDate();
}

/** The first occurrence strictly after `after`. */
export function nextOccurrence(s: Schedule, after: string): string {
  if (!Number.isInteger(s.interval) || s.interval < 1) throw new Error("interval must be a positive integer");
  const base = new Date(toUTC(after));
  if (s.frequency === "weekly") {
    const delta = (s.anchorDay - base.getUTCDay() + 7) % 7;
    // Same weekday as `after` means it already happened; jump a full interval.
    const days = delta === 0 ? 7 * s.interval : delta + 7 * (s.interval - 1);
    return fromUTC(toUTC(after) + days * 86400000);
  }
  // monthly
  let y = base.getUTCFullYear();
  let m0 = base.getUTCMonth();
  const thisMonth = Math.min(s.anchorDay, daysInMonth(y, m0));
  if (base.getUTCDate() < thisMonth && s.interval === 1) {
    return fromUTC(Date.UTC(y, m0, thisMonth));
  }
  m0 += s.interval;
  y += Math.floor(m0 / 12);
  m0 = ((m0 % 12) + 12) % 12;
  return fromUTC(Date.UTC(y, m0, Math.min(s.anchorDay, daysInMonth(y, m0))));
}

/** All occurrences d with from < d <= until, capped at `max` (to bound catch-up after downtime). */
export function occurrencesBetween(s: Schedule, from: string, until: string, max = 12): string[] {
  const out: string[] = [];
  let cursor = from;
  while (out.length < max) {
    const next = nextOccurrence(s, cursor);
    if (next > until) break;
    out.push(next);
    cursor = next;
  }
  return out;
}

export function describeSchedule(s: Schedule): string {
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  if (s.frequency === "weekly") {
    return s.interval === 1 ? `Every ${WEEKDAYS[s.anchorDay]}` : `Every ${s.interval} weeks on ${WEEKDAYS[s.anchorDay]}`;
  }
  const n = s.anchorDay;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  const day = n >= 29 ? (n === 31 ? "last day" : `${n}${suffix} (or the last day)`) : `${n}${suffix}`;
  return s.interval === 1 ? `Monthly on the ${day}` : `Every ${s.interval} months on the ${day}`;
}
