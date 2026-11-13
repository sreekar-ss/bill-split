"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

const PHONE = "(max-width: 767px)";

/**
 * For a sheet shown as its own screen on phones: opening it adds a history entry, so the phone's
 * back button or swipe-back closes the screen instead of leaving the page underneath. Closing it
 * any other way (Back, Save, Escape) removes that entry again, so history stays as it was.
 *
 * Returns the `onOpenChange` to give the sheet. No-op from md up, where it's a dialog.
 * The entry keeps the same URL (Next.js copies its router state into it), so going back
 * doesn't re-render or refetch the page.
 */
export function useBackToClose(open: boolean, onOpenChange: (open: boolean) => void) {
  return useBackToCloseControls(open, onOpenChange).onOpenChange;
}

/**
 * useBackToClose plus `release()`, for a sheet that can also navigate away (Leave group, Delete group).
 * `release()` forgets our history entry without going back, so a router.replace() straight after it
 * overwrites that entry instead of racing a history.back(). Call it, then close the sheet, then replace.
 */
export function useBackToCloseControls(open: boolean, onOpenChange: (open: boolean) => void) {
  const pushed = useRef(false);
  const latest = useRef(onOpenChange);
  useEffect(() => {
    latest.current = onOpenChange;
  });

  useEffect(() => {
    if (!open || !window.matchMedia(PHONE).matches) return;
    window.history.pushState({ bsScreen: true }, "");
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      latest.current(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);

  const close = useCallback((next: boolean) => {
    if (!next && pushed.current) {
      // Drop our history entry. pushed=false makes onPop ignore the popstate this causes; the call below closes the sheet.
      pushed.current = false;
      window.history.back();
    }
    latest.current(next);
  }, []);

  const release = useCallback(() => {
    pushed.current = false;
  }, []);

  return useMemo(() => ({ onOpenChange: close, release }), [close, release]);
}
