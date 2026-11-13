"use client";

import { useLinkStatus } from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils/cn";

/*
 * Pages have no loading skeletons (React holds a skeleton on screen for at least 300ms, which made
 * every tab switch slower than the server). Instead the current page stays put while the next one
 * loads, and this bar along the top shows that a tap registered.
 *
 * Each link reports its own pending state through <LinkPending /> into this tiny store; one bar in
 * the shell reads it. (The bar can't live inside the links: the tab bar's backdrop blur would
 * position it relative to the tab bar instead of the screen.)
 */
let pendingCount = 0;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const notify = () => listeners.forEach((l) => l());

/** Place inside a <Link>: reports while that link's navigation is pending. Renders nothing. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    pendingCount += 1;
    notify();
    return () => {
      pendingCount -= 1;
      notify();
    };
  }, [pending]);
  return null;
}

/** A thin bar along the top of the screen while a page is loading. Fast navigations never show it. */
export function NavProgress() {
  const pending = useSyncExternalStore(
    subscribe,
    () => pendingCount > 0,
    () => false,
  );
  return (
    <div
      aria-hidden
      data-pending={pending || undefined}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden opacity-0",
        pending && "opacity-100 transition-opacity delay-150 duration-150",
      )}
    >
      <div className="animate-nav-progress h-full w-1/3 rounded-r bg-ink motion-reduce:w-full motion-reduce:animate-none" />
    </div>
  );
}
