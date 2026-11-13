"use client";

import { LogOut } from "lucide-react";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/actions/auth";
import { removePushSubscriptionAction } from "@/app/actions/push";
import { useOfflineSync } from "@/components/pwa/offline-sync";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { clearOfflineQueue } from "@/lib/pwa/offline-queue";

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

const count = (n: number) => `${n} ${n === 1 ? "expense" : "expenses"}`;

/**
 * Posts the logout Server Action; works before hydration too. (Without JavaScript the device keeps
 * its push registration until push is turned on there by someone else or "Log out of all devices".)
 *
 * Expenses saved on this device (the offline queue) are this person's data: first try to send
 * them, warn if some are still waiting, and clear the queue before signing out so the next person
 * on the device can't read them.
 */
export function LogoutButton() {
  const formRef = useRef<HTMLFormElement>(null);
  const cleaned = useRef(false);
  const preparing = useRef(false);
  const { syncNow } = useOfflineSync();
  const [unsynced, setUnsynced] = useState(0);
  const [leaving, setLeaving] = useState(false);

  async function finish() {
    setLeaving(true);
    await clearOfflineQueue().catch(() => {});
    await stopPushOnThisDevice();
    cleaned.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form
        ref={formRef}
        action={logoutAction}
        onSubmit={(e) => {
          if (cleaned.current) return;
          e.preventDefault();
          if (preparing.current) return;
          preparing.current = true;
          void (async () => {
            const left = await syncNow().catch(() => 0);
            if (left > 0) {
              preparing.current = false;
              setUnsynced(left);
              return;
            }
            await finish();
          })();
        }}
      >
        <Submit />
      </form>
      <ConfirmDialog
        open={unsynced > 0}
        onOpenChange={(open) => !open && !leaving && setUnsynced(0)}
        title="Log out with unsynced expenses?"
        body={`${count(unsynced)} saved on this device ${unsynced === 1 ? "hasn't" : "haven't"} been added yet. Logging out deletes ${unsynced === 1 ? "it" : "them"} from this device.`}
        confirmLabel="Log out anyway"
        pending={leaving}
        onConfirm={() => void finish()}
      />
    </>
  );
}
