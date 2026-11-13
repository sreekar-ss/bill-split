import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { toDateInput } from "@/lib/domain/dates";
import { sendWeeklyDigests } from "@/lib/server/notifications";
import { runDueRecurring } from "@/lib/server/recurring";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily job (Vercel Cron, see vercel.json). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 * - creates due recurring expenses (idempotent);
 * - on Mondays (UTC), sends weekly digests to people who opted in (idempotent per week).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const given = request.headers.get("authorization") ?? "";
  // Compare bytes, not string lengths: a non-ASCII header can match in length but not in bytes.
  const a = Buffer.from(given);
  const b = Buffer.from(`Bearer ${secret}`);
  const ok = Boolean(secret) && a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const recurring = await runDueRecurring(toDateInput(now));
  const digest = now.getUTCDay() === 1 ? await sendWeeklyDigests(now) : null;
  return NextResponse.json({ ok: true, date: toDateInput(now), recurring, digest });
}
