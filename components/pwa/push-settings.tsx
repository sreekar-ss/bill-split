"use client";

import { BellRing, Check, CircleAlert } from "lucide-react";
import { Switch } from "radix-ui";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { removePushSubscriptionAction, savePushSubscriptionAction, sendTestPushAction } from "@/app/actions/push";
import { enablePush, waitForPushArrival } from "@/lib/pwa/push-client";
import { Button } from "@/components/ui/button";
import { runAction } from "@/lib/client/run-action";
import { useInstallApp } from "./install-app";

/**
 * "Push notifications on this device". iPhone only allows web push in the installed (Home Screen)
 * app, so in Safari we point people to installing first. The permission prompt is only ever
 * triggered by the switch (a user gesture), never by itself.
 */
type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";


const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const install = useInstallApp();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!supported()) {
        next = install?.platform.startsWith("ios") && !install.standalone ? "needs-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        if (sub && Notification.permission === "granted") {
          // Keep the server's copy current (e.g. after signing in on this device as someone else).
          await runAction(() => savePushSubscriptionAction(sub.toJSON()));
          next = "on";
        } else next = "off";
      }
      if (!cancelled) setState(next);
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, [install?.platform, install?.standalone]);

  if (!publicKey) return null;

  async function turnOn() {
    setBusy(true);
    try {
      const res = await enablePush(publicKey!);
      if (res.ok) {
        setState("on");
        toast.success("Push notifications on");
      } else if (res.reason === "denied") setState("denied");
      else if (res.reason === "error") toast.error(res.message ?? "Couldn't turn on notifications on this device. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await runAction(() => removePushSubscriptionAction(sub.endpoint));
        await sub.unsubscribe().catch(() => {});
      }
      setState("off");
      toast.success("Push notifications off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTestResult("Sending…");
    const arrival = waitForPushArrival("test");
    const res = await runAction(() => sendTestPushAction());
    if (!res.ok) return setTestResult(res.error);
    if (res.data.delivered === 0) return setTestResult("We couldn't reach this device. Turn notifications off and on again.");
    setTestResult(
      (await arrival)
        ? "It reached this browser. If no notification popped up, your device is hiding them: on a Mac, open System Settings, then Notifications, and allow your browser; on Windows, Settings, then System, then Notifications. Also check Focus or Do Not Disturb."
        : "We sent it, but it hasn't reached this browser yet. Keep the browser open and try again in a minute. If it still doesn't arrive, turn notifications off and on again.",
    );
  }

  if (state === "loading") return <div className="h-16" aria-busy="true" />;

  if (state === "needs-install") {
    return (
      <div className="flex items-start gap-3 rounded-[10px] border border-rule bg-surface px-3 py-3">
        <BellRing className="mt-0.5 size-[18px] shrink-0 text-ink-muted" aria-hidden />
        <div className="space-y-2">
          <p className="text-body-sm text-ink">
            On iPhone, push notifications work in the installed app. Add BillSplit to your Home Screen, open it from there, and turn
            them on here.
          </p>
          <Button variant="secondary" size="sm" className="h-11" onClick={() => install?.open()}>
            Add to Home Screen
          </Button>
        </div>
      </div>
    );
  }

  if (state === "unsupported") {
    return <p className="text-body-sm text-ink-muted">This browser doesn&apos;t support push notifications. Try BillSplit installed on your phone, or Chrome, Edge, Firefox or Safari on a computer.</p>;
  }

  if (state === "denied") {
    return (
      <div className="flex items-start gap-3 rounded-[10px] border border-rule bg-surface px-3 py-3" role="status">
        <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-ink-muted" aria-hidden />
        <p className="text-body-sm text-ink">
          Notifications are blocked for BillSplit on this device. To allow them, open your device&apos;s Settings, then Notifications, then
          BillSplit (or this site&apos;s settings in your browser), and come back here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex min-h-11 items-center justify-between gap-4 border-y border-rule py-3">
        <div className="min-w-0">
          <label htmlFor={id} className="block cursor-pointer text-body-sm font-semibold text-ink">
            Push notifications on this device
          </label>
          <p id={`${id}-hint`} className="mt-0.5 text-meta text-ink-muted">
            Updates from BillSplit as notifications on this phone or computer.
          </p>
        </div>
        <Switch.Root
          id={id}
          checked={state === "on"}
          disabled={busy}
          aria-describedby={`${id}-hint`}
          onCheckedChange={(on) => (on ? turnOn() : turnOff())}
          className="group relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-field bg-paper transition-colors motion-reduce:transition-none disabled:cursor-wait disabled:opacity-60 data-[state=checked]:border-ink data-[state=checked]:bg-ink before:absolute before:-inset-2 before:content-['']"
        >
          <Switch.Thumb className="grid size-5 translate-x-[3px] place-items-center rounded-full bg-field transition-transform motion-reduce:transition-none data-[state=checked]:translate-x-[23px] data-[state=checked]:bg-surface">
            <Check className="size-3.5 text-ink opacity-0 group-data-[state=checked]:opacity-100" strokeWidth={3} aria-hidden />
          </Switch.Thumb>
        </Switch.Root>
      </div>
      {state === "on" ? (
        <>
          <Button variant="secondary" size="sm" className="h-11" onClick={test} disabled={testResult === "Sending…"}>
            <BellRing aria-hidden />
            Send a test notification
          </Button>
          <p role="status" className="text-body-sm text-ink-muted empty:hidden">
            {testResult}
          </p>
        </>
      ) : null}
    </div>
  );
}
