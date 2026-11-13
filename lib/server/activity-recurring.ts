import "server-only";
import { db } from "./db";

/**
 * Marks expenses that a recurring schedule created, so feeds can label them ("Repeats").
 *
 * Only call this with items the viewer is already allowed to see (from listActivity, getDashboard or
 * getFriend): it reads nothing but the `recurringId` of the given expense ids, and payments pass through.
 * Prefer adding `recurring` to those queries' selects instead; this exists so the flag can be added
 * without changing lib/server/activity.ts or lib/server/friends.ts. Items that already carry a boolean
 * `recurring` are left as they are.
 */
export async function withRecurringFlags<T extends { type: "expense" | "payment"; id: string }>(
  items: T[],
): Promise<(T & { recurring?: boolean })[]> {
  const ids = items.filter((i) => i.type === "expense" && typeof (i as { recurring?: unknown }).recurring !== "boolean").map((i) => i.id);
  if (ids.length === 0) return items;
  const rows = await db.expense.findMany({
    where: { id: { in: ids }, recurringId: { not: null } },
    select: { id: true },
  });
  if (rows.length === 0) return items;
  const recurring = new Set(rows.map((r) => r.id));
  return items.map((i) => (recurring.has(i.id) && i.type === "expense" ? { ...i, recurring: true } : i));
}
