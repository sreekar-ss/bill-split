import { existsSync, readFileSync } from "node:fs";
import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { PUSH_OUTBOX } from "../../playwright.config";
import { expectToast, login, type TestUser } from "./helpers";

/** One push the E2E server "sent" (a JSON line in PUSH_OUTBOX). */
export interface Push {
  endpoint: string;
  userId: string;
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** A fake push endpoint on the allow-listed test host, unique to this test, project and label. */
export function pushEndpoint(info: TestInfo, label: string): string {
  return `https://push.test/${label}-${info.testId}-${info.project.name}-${info.retry}`;
}

/**
 * Headless Chromium can't reach a real push service, so the browser's PushManager is stubbed at the
 * boundary: it hands back a fake subscription on the allow-listed test host. Permission, service
 * worker registration, the server storing the device, and server-side sending are all real.
 * Works on a page (from its next navigation) or on a whole context (every page in it).
 */
export async function stubPush(target: Page | BrowserContext, endpoint: string, { quietPrompt = false }: { quietPrompt?: boolean } = {}) {
  // Tests that turn push on from Account keep the "Turn on notifications?" prompt out of the way.
  if (quietPrompt) await target.addInitScript(() => localStorage.setItem("bs-notify-dismissed-at", String(Date.now())));
  await target.addInitScript((ep) => {
    const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
    // Headless Chromium reports notifications as "denied" regardless of grants; start at "default"
    // and let the (real) user tap grant it, like a person accepting the prompt.
    let permission: NotificationPermission = (sessionStorage.getItem("stub-perm") as NotificationPermission) || "default";
    Object.defineProperty(Notification, "permission", { get: () => permission, configurable: true });
    Notification.requestPermission = async () => {
      permission = "granted";
      sessionStorage.setItem("stub-perm", permission);
      return permission;
    };
    let current: unknown = null;
    const make = () => ({
      endpoint: ep,
      toJSON: () => ({ endpoint: ep, keys }),
      unsubscribe: async () => {
        current = null;
        sessionStorage.removeItem("stub-sub");
        return true;
      },
    });
    // The subscription outlives reloads, like a real one.
    if (sessionStorage.getItem("stub-sub") === "1") current = make();
    PushManager.prototype.getSubscription = async function () {
      return current as PushSubscription | null;
    };
    PushManager.prototype.subscribe = async function () {
      current = make();
      sessionStorage.setItem("stub-sub", "1");
      return current as PushSubscription;
    };
  }, endpoint);
}

/** Every push sent to this device endpoint this run, oldest first. */
export function pushesTo(endpoint: string): Push[] {
  if (!existsSync(PUSH_OUTBOX)) return [];
  return readFileSync(PUSH_OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Push)
    .filter((p) => p.endpoint === endpoint);
}

/** Titles of the pushes to this endpoint, oldest first. */
export function pushTitles(endpoint: string): string[] {
  return pushesTo(endpoint).map((p) => p.title);
}

/** Waits for a push to `endpoint` with this exact title and returns the newest such push. */
export async function waitForPush(endpoint: string, title: string, { timeout = 10_000 }: { timeout?: number } = {}): Promise<Push> {
  await expect.poll(() => pushTitles(endpoint), { timeout, message: `a push "${title}" to ${endpoint}` }).toContain(title);
  return pushesTo(endpoint).findLast((p) => p.title === title)!;
}

/** Turns on "Push notifications on this device" in Account (the page must already be stubbed with `stubPush`). */
export async function turnOnPush(page: Page) {
  await page.goto("/account#notifications");
  const toggle = page.getByRole("switch", { name: "Push notifications on this device" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expectToast(page, "Push notifications on");
  await expect(toggle).toBeChecked();
}

/**
 * Opens a new browser context signed in as `user`, on a (stubbed) device that has push turned on
 * from Account. Leaves the page on Account. Close it with `page.context().close()`.
 */
export async function signedInWithPush(browser: Browser, user: TestUser, endpoint: string): Promise<Page> {
  const context = await browser.newContext();
  await stubPush(context, endpoint, { quietPrompt: true });
  const page = await context.newPage();
  await page.goto("/login");
  await login(page, user.email, user.password);
  await expect(page).toHaveURL(/\/home$/);
  await turnOnPush(page);
  return page;
}
