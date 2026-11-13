/**
 * Browser-side helpers shared by the install and notification prompts: storage that never throws
 * (private mode, blocked site data) and a timer that waits until nothing else is open.
 * Kept out of detect.ts, which stays pure and DOM-free for its unit tests.
 */

/** Set in sessionStorage once the install prompt has shown this session; the notification prompt then holds off. */
export const INSTALL_SHOWN_KEY = "bs-install-shown";

/** Reads `key`, or null when storage is unavailable. Pass a getter, e.g. `() => sessionStorage`, since touching it can throw. */
export function storageGet(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}

/** Writes `key`, silently doing nothing when storage is unavailable (private mode: fine). */
export function storageSet(storage: () => Storage, key: string, value: string): void {
  try {
    storage().setItem(key, value);
  } catch {
    /* private mode: fine */
  }
}

/**
 * Runs `fn` after `delayMs`, but never on top of something the person is doing: while any dialog,
 * sheet or full-screen form is open it keeps waiting. Returns a cancel function.
 */
export function afterDelayWhenIdle(fn: () => void, delayMs: number, retryMs = 3000): () => void {
  let timer = 0;
  const tick = () => {
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) timer = window.setTimeout(tick, retryMs);
    else fn();
  };
  timer = window.setTimeout(tick, delayMs);
  return () => window.clearTimeout(timer);
}
