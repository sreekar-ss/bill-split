import { formatDay } from "@/lib/domain/dates";

/** "Nov 16" for a yyyy-mm-dd date in the current year, "Jan 4, 2027" otherwise. */
export function shortDate(date: string, now: Date = new Date()): string {
  const sameYear = date.slice(0, 4) === String(now.getFullYear());
  return formatDay(date, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

/** "Every Monday" → "every Monday", for use mid-sentence. */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Makes sure a reason reads as a full sentence before more text is added after it. */
export function asSentence(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * What to do when the daily job paused a schedule. A schedule's people and split can't be edited
 * (editing one expense changes only that one), so the way out is a new schedule.
 */
export const PAUSED_FIX = "To keep it going, stop repeating and add it again as a new recurring expense.";
