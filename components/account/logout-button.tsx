"use client";

import { LogOut } from "lucide-react";
import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/actions/auth";
import { removePushSubscriptionAction } from "@/app/actions/push";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <LogOut aria-hidden />
      {pending ? "Logging out…" : "Log out"}
    </Button>
  );
}

/**
 * Stop push notifications on this device before signing out, so the next person to use it doesn't
 * get this account's notifications. Best effort, capped at 2 seconds.
 */
async function stopPushOnThisDevice() {
  if (!("serviceWorker" in navigator)) return;
  const work = (async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await removePushSubscriptionAction(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
  })();
  await Promise.race([work.catch(() => {}), new Promise((r) => setTimeout(r, 2000))]);
}

/**
 * Posts the logout Server Action; works before hydration too. (Without JavaScript the device keeps
 * its push registration until push is turned on there by someone else or "Log out of all devices".)
 */
export function LogoutButton() {
  const formRef = useRef<HTMLFormElement>(null);
  const cleaned = useRef(false);
  return (
    <form
      ref={formRef}
      action={logoutAction}
      onSubmit={(e) => {
        if (cleaned.current) return;
        e.preventDefault();
        stopPushOnThisDevice().finally(() => {
          cleaned.current = true;
          formRef.current?.requestSubmit();
        });
      }}
    >
      <Submit />
    </form>
  );
}
