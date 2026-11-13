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

/** Save (or move to this user) a device's subscription. Idempotent per endpoint. */
export async function savePushSubscription(userId: string, input: unknown, userAgent?: string | null) {
  if (!isPushConfigured()) throw new AppError("Push notifications aren't set up on this server yet.", "CONFLICT");
  const sub = parse(subscriptionSchema, input);
  await db.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    create: { userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    // A device signing in as someone else takes the subscription over (one owner per device).
    update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, failures: 0, userAgent: userAgent?.slice(0, 300) ?? null },
  });
  const all = await db.pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  if (all.length > MAX_DEVICES_PER_USER) {
    await db.pushSubscription.deleteMany({ where: { id: { in: all.slice(MAX_DEVICES_PER_USER).map((s) => s.id) } } });
  }
}

export async function removePushSubscription(userId: string, endpoint: string) {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint: String(endpoint).slice(0, 2048) } });
}

export async function hasPushDevices(userId: string) {
  return (await db.pushSubscription.count({ where: { userId } })) > 0;
}

/** Send to every device of a user. Dead subscriptions (404/410) are removed. Never throws. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const t = transport();
  if (!t) return 0;
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  let delivered = 0;
  const body = JSON.stringify({ ...payload, url: payload.url.startsWith("/") ? payload.url : "/home" });
  for (const s of subs) {
    try {
      if (t === "memory") sentPushes.push({ ...payload, endpoint: s.endpoint });
      else if (t === "file") await appendFile(process.env.PUSH_OUTBOX!, JSON.stringify({ ...payload, endpoint: s.endpoint, userId, sentAt: new Date().toISOString() }) + "\n");
      else {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
          urgency: "normal",
          vapidDetails: {
            subject: process.env.VAPID_SUBJECT?.trim() || "mailto:noreply@billsplit.thevector.dev",
            publicKey: process.env.VAPID_PUBLIC_KEY!.trim(),
            privateKey: process.env.VAPID_PRIVATE_KEY!.trim(),
          },
        });
      }
      delivered++;
      await db.pushSubscription.update({ where: { id: s.id }, data: { lastSuccessAt: new Date(), failures: 0 } });
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410 || s.failures + 1 >= MAX_FAILURES) {
        await db.pushSubscription.deleteMany({ where: { id: s.id } });
      } else {
        await db.pushSubscription.updateMany({ where: { id: s.id }, data: { failures: { increment: 1 } } });
        console.error("[push] send failed", status ?? error);
      }
    }
  }
  return delivered;
}
