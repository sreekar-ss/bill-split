import "server-only";
import { db } from "./db";

/**
 * Fixed-window counters in Postgres (no extra infrastructure). One atomic upsert per hit.
 * Keys are namespaced, e.g. "login:email:ana@x.com", "login:ip:1.2.3.4".
 */
export async function hit(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
  const rows = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + ${windowMs} * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN now() + ${windowMs} * interval '1 millisecond' ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  return rows[0];
}

/** Current count without incrementing (0 when the window has passed). */
export async function peek(key: string): Promise<{ count: number; resetAt: Date | null }> {
  const row = await db.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt <= new Date()) return { count: 0, resetAt: null };
  return { count: row.count, resetAt: row.resetAt };
}

export async function clear(key: string): Promise<void> {
  await db.rateLimit.deleteMany({ where: { key } });
}

export function minutesUntil(date: Date | null): number {
  return date ? Math.max(1, Math.ceil((date.getTime() - Date.now()) / 60000)) : 1;
}
