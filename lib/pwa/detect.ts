/**
 * Install-prompt decisions, kept pure so they're unit-tested.
 * iOS has no install API: we can only show the Share → Add to Home Screen steps.
 * Android Chrome fires `beforeinstallprompt`, which lets us show a real Install button.
 */
export type InstallPlatform = "ios-safari" | "ios-other" | "ios-inapp" | "android" | "desktop";

export function detectPlatform(ua: string, maxTouchPoints = 0): InstallPlatform {
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1); // iPadOS reports as Mac
  if (ios) {
    // In-app browsers (Instagram, Facebook, LinkedIn…) can't add to the Home Screen.
    if (/FBAN|FBAV|Instagram|LinkedInApp|Snapchat|Line\/|Twitter|MicroMessenger|GSA\//i.test(ua)) return "ios-inapp";
    if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)) return "ios-other"; // iOS 16.4+: Share → Add to Home Screen
    return "ios-safari";
  }
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export const DISMISS_DAYS = 30;

/** Whether to pop the prompt by itself (Account always offers it on demand). */
export function shouldAutoPrompt(input: {
  platform: InstallPlatform;
  standalone: boolean;
  /** The user has a group or friend, i.e. has got something out of the app already. */
  engaged: boolean;
  dismissedAt: number | null;
  shownThisSession: boolean;
  now: number;
  /** Android only: Chrome said it can install (beforeinstallprompt fired). */
  canInstallNatively?: boolean;
}): boolean {
  const { platform, standalone, engaged, dismissedAt, shownThisSession, now } = input;
  if (standalone || !engaged || shownThisSession) return false;
  if (platform === "desktop" || platform === "ios-inapp") return false;
  if (platform === "android" && !input.canInstallNatively) return false;
  if (dismissedAt && now - dismissedAt < DISMISS_DAYS * 86400000) return false;
  return true;
}
