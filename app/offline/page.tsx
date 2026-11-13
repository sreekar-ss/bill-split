import { CloudOff } from "lucide-react";
import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "You're offline", robots: { index: false } };
export const dynamic = "force-static";

/**
 * Shown by the service worker (public/sw.js) when a page can't load without a connection. The worker
 * caches this page at install with its CSS inlined and its scripts removed, so it is plain HTML:
 * no auth, no data, no hydration. Retry and the reconnect reload are this tiny inline script.
 */
const retryScript = `(function(){function r(){location.reload()}document.addEventListener("click",function(e){var t=e.target;if(t&&t.closest&&t.closest("[data-offline-retry]"))r()});window.addEventListener("online",r)})();`;

export default function OfflinePage() {
  return (
    <div className="min-h-dvh px-4 pb-12 pt-4 md:px-6 md:pt-6">
      <header className="mx-auto flex max-w-[1040px] items-center">
        <span className="inline-flex h-11 items-center text-title font-bold tracking-tight">BillSplit</span>
      </header>
      <main id="main" className="mx-auto mt-10 w-full max-w-[400px] md:mt-[12vh]">
        <CloudOff className="size-10 text-ink-muted" aria-hidden />
        <h1 className="mt-4 text-heading font-bold">You&apos;re offline</h1>
        <p className="mt-2 text-body-sm text-ink-muted">This page needs a connection to load. It will reload by itself once you&apos;re back online.</p>
        <p className="mt-2 text-body-sm text-ink-muted">
          If BillSplit is still open in another tab or window, you can add expenses there. They&apos;re saved on the device and sync when you reconnect.
        </p>
        <button type="button" data-offline-retry className={buttonVariants({ size: "lg", className: "mt-6" })}>
          Retry
        </button>
      </main>
      <script dangerouslySetInnerHTML={{ __html: retryScript }} />
    </div>
  );
}
