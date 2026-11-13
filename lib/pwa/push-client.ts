"use client";

import { savePushSubscriptionAction } from "@/app/actions/push";
import { runAction } from "@/lib/client/run-action";

/** Browser-side push helpers shared by Account → Notifications and the "turn on notifications" prompt. */

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.register("/sw.js");
  return reg.pushManager.getSubscription();
}

export type EnableResult = { ok: true } | { ok: false; reason: "denied" | "dismissed" | "error"; message?: string };

/**
 * Ask for permission (must be called straight from a tap: Safari only prompts inside a user gesture),
 * then subscribe this device and register it with the server.
 */
export async function enablePush(publicKey: string): Promise<EnableResult> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: permission === "denied" ? "denied" : "dismissed" };
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
    const res = await runAction(() => savePushSubscriptionAction(sub.toJSON()));
    if (!res.ok) {
      await sub.unsubscribe().catch(() => {});
      return { ok: false, reason: "error", message: res.error };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Resolves true if the service worker reports a push with this tag arrived within `ms`. */
export function waitForPushArrival(tag: string, ms = 12000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!("serviceWorker" in navigator)) return resolve(false);
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "push-received" && e.data?.tag === tag) {
        cleanup();
        resolve(true);
      }
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve(false);
    }, ms);
    const cleanup = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
  });
}
