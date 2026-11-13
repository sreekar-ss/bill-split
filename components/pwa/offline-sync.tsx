"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { createExpenseAction } from "@/app/actions/expenses";
import { useAddExpense } from "@/components/shell/add-expense-context";
import { runAction, UNREACHABLE_ERROR } from "@/lib/client/run-action";
import {
  listQueuedExpenses,
  markQueuedExpenseFailed,
  offlineQueueSupported,
  putQueuedExpense,
  removeQueuedExpense,
  subscribeOfflineQueue,
  type QueuedExpense,
} from "@/lib/pwa/offline-queue";

/**
 * Sends expenses that were saved on this device while offline. It runs when the app loads, when the
 * connection comes back, when the tab becomes visible again, and every minute while something is
 * waiting (for "connected but nothing gets through"). Each replay uses the item's clientId, so a
 * save that already reached the server is not added twice.
 *
 * Items queued by a different account on this device are discarded, never sent as this user.
 * An item the server refuses is kept, marked failed, for the person to review or discard; it is
 * never silently dropped. While offline, links to other pages show a toast instead of leaving the
 * app for the offline page. Also registers the service worker for everyone (the offline page).
 */

/** The generic server failure from app/actions/run.ts guard(): worth retrying later, not dropping. */
const SERVER_ERROR = "Something went wrong on our side. Try again in a moment.";
const RETRY_MS = 60_000;

interface OfflineSyncApi {
  online: boolean;
  /** This user's items on this device, oldest first: waiting ones and ones the server refused. */
  items: QueuedExpense[];
  /** Expenses this user has waiting to be sent from this device. */
  waiting: number;
  /** Expenses the server refused, kept for review. */
  failed: number;
  syncing: boolean;
  /** Try to send now. Resolves with how many of this user's items are still on the device. */
  syncNow: () => Promise<number>;
  /** Open the expense sheet prefilled from a queued item (to fix and save it). */
  review: (item: QueuedExpense) => void;
  /** Delete an item from this device, with an Undo toast. */
  discard: (item: QueuedExpense) => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncApi>({
  online: true,
  items: [],
  waiting: 0,
  failed: 0,
  syncing: false,
  syncNow: async () => 0,
  review: () => {},
  discard: async () => {},
});

export function useOfflineSync(): OfflineSyncApi {
  return useContext(OfflineSyncContext);
}

function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine !== false,
    () => true,
  );
}

const isTransient = (error: string) => error === UNREACHABLE_ERROR || error === SERVER_ERROR;

/** One flush at a time across tabs, so two tabs don't both toast the same sync. */
async function withFlushLock(work: () => Promise<void>) {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks?.request) return work();
  await locks.request("bs-offline-flush", { ifAvailable: true }, async (lock) => {
    if (lock) await work();
  });
}

/** Internal links in the app (not downloads, new tabs or same-page anchors). */
function inAppLink(event: MouseEvent): HTMLAnchorElement | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const a = (event.target as Element | null)?.closest?.("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return null;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return null;
  if (url.pathname === location.pathname && url.search === location.search) return null; // #main, #comments
  return a;
}

export function OfflineSyncProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const online = useOnline();
  const { openAddExpense } = useAddExpense();
  const [items, setItems] = useState<QueuedExpense[]>([]);
  const [syncing, setSyncing] = useState(false);
  const busy = useRef(false);

  const recount = useCallback(async (): Promise<number> => {
    try {
      const mine = (await listQueuedExpenses()).filter((i) => i.userId === userId);
      setItems(mine);
      return mine.length;
    } catch {
      setItems([]);
      return 0;
    }
  }, [userId]);

  const review = useCallback((item: QueuedExpense) => openAddExpense({ draft: item }), [openAddExpense]);

  const flush = useCallback(async (): Promise<number> => {
    if (busy.current) return recount();
    busy.current = true;
    try {
      // Offline or no IndexedDB: nothing to send, but the count below is still refreshed.
      if (offlineQueueSupported() && navigator.onLine !== false) await withFlushLock(async () => {
        const items = await listQueuedExpenses();
        const mine = items.filter((i) => i.userId === userId && !i.failed);
        // Someone else's offline saves: they must never be sent from this account.
        for (const other of items) if (other.userId !== userId) await removeQueuedExpense(other.clientId);
        if (!mine.length) return;

        setSyncing(true);
        const added: string[] = [];
        for (const item of mine) {
          const label = item.input.description;
          const result = await runAction(() => createExpenseAction(item.input));
          if (result.ok) {
            await removeQueuedExpense(item.clientId);
            added.push(label);
            continue;
          }
          // Still can't get through: keep this one and the rest for the next try.
          if (isTransient(result.error)) break;
          // The server won't take it (left the group, archived, invalid): keep it for review, never drop it.
          await markQueuedExpenseFailed(item, result.error);
          toast.error(`Couldn't add '${label}'`, {
            description: result.error,
            duration: 10_000,
            action: { label: "Review", onClick: () => review(item) },
          });
        }
        if (added.length === 1) toast.success(`Added '${added[0]}'`);
        else if (added.length > 1) toast.success(`Added ${added.length} expenses saved offline`);
      });
    } catch (error) {
      // IndexedDB trouble, or the session ended (the action redirects to log in). Items stay put.
      console.error("[offline] sync failed", error);
    } finally {
      busy.current = false;
      setSyncing(false);
    }
    return recount();
  }, [userId, recount, review]);

  const discard = useCallback(async (item: QueuedExpense) => {
    await removeQueuedExpense(item.clientId);
    toast(`Removed '${item.input.description}' from this device`, {
      action: { label: "Undo", onClick: () => void putQueuedExpense(item) },
    });
  }, []);

  // Register the service worker (offline page). Push registers the same script, so this is a no-op then.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  // Keep the count current (this tab and others), and flush on load, reconnect and return to the tab.
  useEffect(() => {
    if (!offlineQueueSupported()) return;
    const unsubscribe = subscribeOfflineQueue(() => void recount());
    const onVisible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    void flush(); // also counts what's waiting, online or not
    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush, recount]);

  const waiting = items.filter((i) => !i.failed).length;
  const failed = items.length - waiting;

  // While something is waiting and we look online, retry now and then.
  useEffect(() => {
    if (!waiting || !online) return;
    const timer = window.setInterval(() => void flush(), RETRY_MS);
    return () => window.clearInterval(timer);
  }, [waiting, online, flush]);

  // While offline, a tap on a tab or row would fail its fetch and land on the offline page, out of
  // the app. Stay put instead, so Add expense keeps working.
  useEffect(() => {
    if (online) return;
    const onClick = (event: MouseEvent) => {
      if (!inAppLink(event)) return;
      event.preventDefault();
      event.stopPropagation();
      toast("You're offline", {
        id: "offline-navigation",
        description: "That page needs a connection. You can still add expenses here, and they'll sync when you're back online.",
      });
    };
    // Window capture runs before React's own listeners (App Router hydrates on the document).
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [online]);

  const api = useMemo(
    () => ({ online, items, waiting, failed, syncing, syncNow: flush, review, discard }),
    [online, items, waiting, failed, syncing, flush, review, discard],
  );
  return <OfflineSyncContext.Provider value={api}>{children}</OfflineSyncContext.Provider>;
}
