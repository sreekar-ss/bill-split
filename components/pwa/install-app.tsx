"use client";

import { Download, EllipsisVertical, Link2, Share, SquarePlus } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { detectPlatform, shouldAutoPrompt, type InstallPlatform } from "@/lib/pwa/detect";

/**
 * "Install the app": iPhone gets the Share → Add to Home Screen steps (iOS has no install API);
 * Android Chrome gets a real Install button via `beforeinstallprompt`. The prompt opens by itself
 * at most once per session, only on phones, only for engaged users, and "Not now" hides it 30 days.
 */
const DISMISS_KEY = "bs-install-dismissed-at";
const SESSION_KEY = "bs-install-shown";
const AUTO_DELAY_MS = 4000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallApi {
  platform: InstallPlatform;
  standalone: boolean;
  open: () => void;
}

const InstallContext = createContext<InstallApi | null>(null);

export function useInstallApp(): InstallApi | null {
  return useContext(InstallContext);
}

const read = (store: () => Storage, key: string) => {
  try {
    return store().getItem(key);
  } catch {
    return null;
  }
};
const write = (store: () => Storage, key: string, value: string) => {
  try {
    store().setItem(key, value);
  } catch {
    /* private mode: fine */
  }
};

function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const noSubscribe = () => () => {};
function subscribeDisplayMode(cb: () => void) {
  const mq = window.matchMedia?.("(display-mode: standalone)");
  mq?.addEventListener("change", cb);
  return () => mq?.removeEventListener("change", cb);
}

export function InstallAppProvider({ engaged, children }: { engaged: boolean; children: React.ReactNode }) {
  // Browser-only facts; the server render assumes desktop / not installed.
  const platform = useSyncExternalStore<InstallPlatform>(
    noSubscribe,
    () => detectPlatform(navigator.userAgent, navigator.maxTouchPoints),
    () => "desktop",
  );
  const runningInstalled = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);
  const [installedNow, setInstalledNow] = useState(false);
  const standalone = runningInstalled || installedNow;
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep Chrome's mini-infobar away; we show our own sheet
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalledNow(true);
      setOpen(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Open by itself once, a few seconds in, when it makes sense.
  useEffect(() => {
    const dismissed = Number(read(() => localStorage, DISMISS_KEY)) || null;
    const ok = shouldAutoPrompt({
      platform,
      standalone,
      engaged,
      dismissedAt: dismissed,
      shownThisSession: read(() => sessionStorage, SESSION_KEY) === "1",
      now: Date.now(),
      canInstallNatively: Boolean(deferred),
    });
    if (!ok) return;
    const t = window.setTimeout(() => {
      write(() => sessionStorage, SESSION_KEY, "1");
      setOpen(true);
    }, AUTO_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [platform, standalone, engaged, deferred]);

  const api = useMemo(() => ({ platform, standalone, open: () => setOpen(true) }), [platform, standalone]);

  const notNow = () => {
    write(() => localStorage, DISMISS_KEY, String(Date.now()));
    setOpen(false);
  };

  const installNatively = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setOpen(false);
    if (outcome === "accepted") toast.success("BillSplit installed");
  }, [deferred]);

  return (
    <InstallContext.Provider value={api}>
      {children}
      <Sheet
        open={open}
        onOpenChange={(o) => (o ? setOpen(true) : notNow())}
        title={platform === "android" || platform === "desktop" ? "Install BillSplit" : "Add BillSplit to your Home Screen"}
        description="It opens full screen, like an app, so your balances are one tap away."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" size="lg" className="flex-1" onClick={notNow}>
              Not now
            </Button>
            {platform === "android" && deferred ? (
              <Button size="lg" className="flex-1" onClick={installNatively}>
                <Download aria-hidden />
                Install
              </Button>
            ) : (
              <Button size="lg" className="flex-1" onClick={notNow}>
                Done
              </Button>
            )}
          </div>
        }
      >
        <InstallSteps platform={platform} canInstallNatively={Boolean(deferred)} />
      </Sheet>
    </InstallContext.Provider>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span aria-hidden className="num grid size-7 shrink-0 place-items-center rounded-full bg-ink text-meta font-bold text-surface">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}

const Glyph = ({ children }: { children: React.ReactNode }) => (
  <span className="mx-1 inline-flex size-7 translate-y-[3px] items-center justify-center rounded-[7px] border border-field bg-surface align-baseline text-ink [&_svg]:size-4">
    {children}
  </span>
);

function InstallSteps({ platform, canInstallNatively }: { platform: InstallPlatform; canInstallNatively: boolean }) {
  const loginNote = (
    <p className="mt-4 text-body-sm text-ink-muted">
      The first time you open it from the Home Screen, log in once more. iPhone keeps installed apps separate from Safari.
    </p>
  );

  if (platform === "ios-inapp") {
    return (
      <div>
        <p>This browser can&apos;t add apps to your Home Screen. Open this page in Safari first, then use Share and Add to Home Screen.</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.origin + "/home");
              toast.success("Link copied. Paste it into Safari.");
            } catch {
              toast.error("Couldn't copy. Open billsplit in Safari instead.");
            }
          }}
        >
          <Link2 aria-hidden />
          Copy link for Safari
        </Button>
      </div>
    );
  }

  if (platform === "ios-safari" || platform === "ios-other") {
    return (
      <div>
        <ol className="space-y-4" aria-label="How to add BillSplit to your Home Screen">
          <Step n={1}>
            Tap the Share button
            <Glyph>
              <Share aria-hidden />
            </Glyph>
            {platform === "ios-safari" ? "in Safari's toolbar." : "in the address bar."}
          </Step>
          <Step n={2}>
            Scroll down and tap
            <Glyph>
              <SquarePlus aria-hidden />
            </Glyph>
            <strong>Add to Home Screen</strong>.
          </Step>
          <Step n={3}>
            Tap <strong>Add</strong>. BillSplit appears on your Home Screen.
          </Step>
        </ol>
        {loginNote}
      </div>
    );
  }

  if (platform === "android") {
    return canInstallNatively ? (
      <p>Tap Install to add BillSplit to your Home Screen and app drawer.</p>
    ) : (
      <ol className="space-y-4" aria-label="How to install BillSplit">
        <Step n={1}>
          Open Chrome&apos;s menu
          <Glyph>
            <EllipsisVertical aria-hidden />
          </Glyph>
          at the top right.
        </Step>
        <Step n={2}>
          Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
        </Step>
      </ol>
    );
  }

  return (
    <p>
      BillSplit installs on your phone. On your iPhone or Android phone, open{" "}
      <strong className="break-all">{typeof window !== "undefined" ? window.location.host : "BillSplit"}</strong> and choose
      Add to Home Screen.
    </p>
  );
}

/** Account page entry point; works even after "Not now". */
export function InstallAppSection() {
  const install = useInstallApp();
  if (!install) return null;
  if (install.standalone) return <p className="text-body-sm text-ink-muted">You&apos;re using the installed app.</p>;
  return (
    <div className="space-y-3">
      <p className="text-body-sm text-ink-muted">Put BillSplit on your Home Screen so it opens like an app, full screen.</p>
      <Button variant="secondary" onClick={install.open}>
        <Download aria-hidden />
        {install.platform.startsWith("ios") ? "Add to Home Screen" : "Install app"}
      </Button>
    </div>
  );
}
