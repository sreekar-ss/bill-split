import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { PUSH_OUTBOX } from "../../playwright.config";
import { addExpense, expectToast, makeUser, register, setupGroup, signedIn } from "./helpers";
import { expect, test } from "./fixtures";

/**
 * Headless Chromium can't reach a real push service, so the browser's PushManager is stubbed at the
 * boundary: it hands back a fake subscription on the allow-listed test host. Permission, service
 * worker registration, the server storing the device, and server-side sending are all real.
 */
async function stubPush(page: Page, endpoint: string) {
  await page.addInitScript((ep) => {
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

function pushesTo(endpoint: string) {
  return readFileSync(PUSH_OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { endpoint: string; title: string; body: string; url: string })
    .filter((p) => p.endpoint === endpoint);
}

test("turn on push for this device, get a test and a real notification, turn it off", async ({ page, browser }, info) => {
  const endpoint = `https://push.test/${info.testId}-${info.project.name}`;
  await stubPush(page, endpoint);
  const { others, url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
  const ben = others[0];

  await page.goto("/account#notifications");
  const toggle = page.getByRole("switch", { name: "Push notifications on this device" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expectToast(page, "Push notifications on");
  await expect(toggle).toBeChecked();

  await page.getByRole("button", { name: "Send a test notification" }).click();
  await expectToast(page, "Test sent");
  await expect.poll(() => pushesTo(endpoint).map((p) => p.title)).toEqual(["Notifications are on"]);

  // Ben adds an expense with Ana → Ana's device gets it.
  const benPage = await signedIn(browser, ben);
  await benPage.goto(url);
  await addExpense(benPage, { description: "Groceries", amount: "40", paidBy: "You" });
  await expect.poll(() => pushesTo(endpoint).map((p) => p.title), { timeout: 10_000 }).toContain("Ben added Groceries");
  const push = pushesTo(endpoint).find((p) => p.title === "Ben added Groceries")!;
  expect(push.body).toBe("You owe $20.00. In Flat.");
  expect(push.url).toMatch(/^\/expenses\//);

  // Survives a reload (state comes from the browser's real registration + server).
  await page.reload();
  await expect(page.getByRole("switch", { name: "Push notifications on this device" })).toBeChecked();
  await page.getByRole("switch", { name: "Push notifications on this device" }).click();
  await expectToast(page, "Push notifications off");
  await expect(page.getByRole("button", { name: "Send a test notification" })).toHaveCount(0);
});

test.describe("iPhone Safari (not installed)", () => {
  test.use({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("explains that push needs the installed app", async ({ page }, info) => {
    // Safari tabs have no PushManager; only Home Screen apps do.
    await page.addInitScript(() => {
      // @ts-expect-error — simulate Safari outside an installed web app
      delete window.PushManager;
    });
    await register(page, makeUser(info, "Ivy"));
    await page.goto("/account#notifications");
    await expect(page.getByText("On iPhone, push notifications work in the installed app.")).toBeVisible();
    await page.getByRole("button", { name: "Add to Home Screen" }).first().click();
    await expect(page.getByRole("dialog", { name: "Add BillSplit to your Home Screen" })).toBeVisible();
  });
});
