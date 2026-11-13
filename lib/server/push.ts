import "server-only";
import { appendFile } from "node:fs/promises";
import webpush from "web-push";
import { z } from "zod";
import { db } from "./db";
import { AppError } from "./errors";
import { parse } from "./parse";

/**
 * Web Push. Delivery:
 * - VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY set → real pushes via the browser's push service;
 * - PUSH_TRANSPORT=memory → `sentPushes` (integration tests); =file → JSON lines in PUSH_OUTBOX (E2E);
 * - otherwise push is "not configured" and the UI hides it.
 *
 * Push endpoints come from the browser, and the server POSTs to them, so only the real push
 * services' hosts are accepted (no SSRF to arbitrary/internal URLs).
 */

export interface PushPayload {
  title: string;
  body: string;
  /** App-relative path to open on tap, e.g. "/expenses/abc". */
  url: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
}

export const sentPushes: (PushPayload & { endpoint: string })[] = [];

const MAX_DEVICES_PER_USER = 10;
const MAX_FAILURES = 5;
const TEST_PUBLIC_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

type Transport = "webpush" | "memory" | "file" | null;
function transport(): Transport {
  if (process.env.PUSH_TRANSPORT === "memory") return "memory";
  if (process.env.PUSH_TRANSPORT === "file" && process.env.PUSH_OUTBOX) return "file";
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return "webpush";
  return null;
}

export function isPushConfigured() {
  return transport() !== null;
}

/** The application server key the browser subscribes with (public by design). */
export function pushPublicKey(): string | null {
  const t = transport();
  if (t === "webpush") return process.env.VAPID_PUBLIC_KEY!.trim();
  if (t === "memory" || t === "file") return TEST_PUBLIC_KEY;
  return null;
}

const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
    if ((transport() === "memory" || transport() === "file") && u.hostname === "push.test") return true;
    return PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

const b64url = /^[A-Za-z0-9_-]+={0,2}$/;
const subscriptionSchema = z.object({
  endpoint: z.string().max(2048).refine(allowedEndpoint, "That push service isn't supported."),
  keys: z.object({
    p256dh: z.string().min(40).max(200).regex(b64url),
    auth: z.string().min(8).max(64).regex(b64url),
  }),
});

/**
 * Save a device's subscription for this user. A device already registered to someone else moves
 * over only when the browser presents the same keys (the same subscription, e.g. a shared phone
 * where someone else signs in) — knowing an endpoint URL alone can't hijack another person's device.
 */
export async function savePushSubscription(userId: string, input: unknown, userAgent?: string | null) {
  if (!isPushConfigured()) throw new AppError("Push notifications aren't set up on this server yet.", "CONFLICT");
  const sub = parse(subscriptionSchema, input);
  const { sessionVersion } = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
  const existing = await db.pushSubscription.findUnique({ where: { endpoint: sub.endpoint } });
  if (existing && existing.userId !== userId && (existing.p256dh !== sub.keys.p256dh || existing.auth !== sub.keys.auth)) {
    throw new AppError("This device is already set up for notifications. Turn notifications off and on again.", "CONFLICT");
  }
  const data = { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, sessionVersion, failures: 0, userAgent: userAgent?.slice(0, 300) ?? null };
  await db.pushSubscription.upsert({ where: { endpoint: sub.endpoint }, create: { endpoint: sub.endpoint, ...data }, update: data });
  const all = await db.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (all.length > MAX_DEVICES_PER_USER) {
    await db.pushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES_PER_USER).map((s) => s.id) } } });
  }
}

/** Cut off every device (logout everywhere, password change/reset, account deletion). */
export async function removeAllPushSubscriptions(userId: string, client: Pick<typeof db, "pushSubscription"> = db) {
  await client.pushSubscription.deleteMany({ where: { userId } });
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint: String(endpoint).slice(0, 2048) } });
}

export async function hasPushDevices(userId: string) {
  return (await db.pushSubscription.count({ where: { userId } })) > 0;
}

/**
 * Send to every device of a user, in parallel, with a timeout. Only devices registered under the
 * user's current sessionVersion receive anything (older ones are removed). Dead subscriptions
 * (404/410, or repeated failures) are removed. Never throws.
 */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const t = transport();
  if (!t) return 0;
  const user = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  if (!user) return 0;
  await db.pushSubscription.deleteMany({ where: { userId, sessionVersion: { not: user.sessionVersion } } });
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify({ ...payload, url: payload.url.startsWith("/") ? payload.url : "/home" });

  const results = await Promise.allSettled(
    subs.map(async (s) => {
      try {
        if (t === "memory") sentPushes.push({ ...payload, endpoint: s.endpoint });
        else if (t === "file") await appendFile(process.env.PUSH_OUTBOX!, JSON.stringify({ ...payload, endpoint: s.endpoint, userId, sentAt: new Date().toISOString() }) + "\n");
        else {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60 * 24,
            urgency: "normal",
            timeout: 5000,
            vapidDetails: {
              subject: process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@billsplit.thevector.dev",
              publicKey: process.env.VAPID_PUBLIC_KEY!.trim(),
              privateKey: process.env.VAPID_PRIVATE_KEY!.trim(),
            },
          });
        }
        await db.pushSubscription.updateMany({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failures: 0 } });
        return true;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || s.failures + 1 >= MAX_FAILURES) {
          await db.pushSubscription.deleteMany({ where: { id: s.id } });
        } else {
          await db.pushSubscription.updateMany({ where: { id: s.id }, data: { failures: { increment: 1 } } });
          console.error("[push] send failed", status ?? error);
        }
        return false;
      }
    }),
  );
  return results.filter((r) => r.status === "fulfilled" && r.value).length;
}
