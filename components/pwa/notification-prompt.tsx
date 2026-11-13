"use client";

import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { afterDelayWhenIdle, INSTALL_SHOWN_KEY, storageGet, storageSet } from "@/lib/pwa/prompt-storage";
import { currentSubscription, enablePush, pushSupported } from "@/lib/pwa/push-client";

/**
 * Asks people to turn on notifications when they open the app and push isn't on for this device.
 * The OS permission dialog only ever appears after they tap "Turn on notifications".
 * Shown at most once per session, never in the same session as the install prompt, and
 * "Not now" hides it for 14 days. iPhone Safari tabs can't do push (the install prompt covers them).
 */
const DISMISS_KEY = "bs-notify-dismissed-at";
const SHOWN_KEY = "bs-notify-shown";
const DISMISS_DAYS = 14;
const DELAY_MS = 6000;

export function NotificationPrompt({ publicKey, engaged }: { publicKey: string | null; engaged: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!publicKey || !engaged || !pushSupported()) return;
    if (Notification.permission === "denied") return;
    const dismissed = Number(storageGet(() => localStorage, DISMISS_KEY)) || 0;
    if (dismissed && Date.now() - dismissed < DISMISS_DAYS * 86400000) return;
    if (storageGet(() => sessionStorage, SHOWN_KEY) === "1") return;
    let cancelled = false;
    const cancelTimer = afterDelayWhenIdle(async () => {
      // Don't stack prompts: the install prompt had this session.
      if (cancelled || storageGet(() => sessionStorage, INSTALL_SHOWN_KEY) === "1") return;
      const sub = await currentSubscription().catch(() => null);
      if (cancelled || sub) return;
      storageSet(() => sessionStorage, SHOWN_KEY, "1");
      setOpen(true);
    }, DELAY_MS);
    return () => {
      cancelled = true;
      cancelTimer();
    };
  }, [publicKey, engaged]);

  const notNow = () => {
    storageSet(() => localStorage, DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  async function turnOn() {
    setBusy(true);
    const res = await enablePush(publicKey!);
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      toast.success("Notifications on. You'll hear from BillSplit here.");
    } else if (res.reason === "denied") {
      storageSet(() => localStorage, DISMISS_KEY, String(Date.now()));
      setOpen(false);
      toast("Notifications are blocked. You can allow them later in your device or browser settings.");
    } else if (res.reason === "error") {
      toast.error(res.message ?? "Couldn't turn on notifications. Try again from Account.");
    }
  }

  if (!publicKey) return null;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? setOpen(true) : notNow())}
      title="Turn on notifications?"
      description="Know straight away when something changes, without checking the app."
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={notNow}>
            Not now
          </Button>
          <Button size="lg" className="flex-1" onClick={turnOn} disabled={busy}>
            <BellRing aria-hidden />
            {busy ? "Turning on…" : "Turn on notifications"}
          </Button>
        </div>
      }
    >
      <ul className="space-y-2 text-body-sm">
        <li>When a friend adds an expense with you, and what your share is.</li>
        <li>When someone pays you back.</li>
        <li>When someone reminds you about money you owe.</li>
      </ul>
      <p className="mt-4 text-body-sm text-ink-muted">You can change what you get, or turn them off, any time in Account.</p>
    </Sheet>
  );
}
