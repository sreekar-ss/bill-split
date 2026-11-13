import { addExpense, expectToast, makeUser, register, setupGroup, signedIn } from "./helpers";
import { expect, test } from "./fixtures";
import { pushesTo, stubPush } from "./push";

test("turn on push for this device, get a test and a real notification, turn it off", async ({ page, browser }, info) => {
  const endpoint = `https://push.test/${info.testId}-${info.project.name}`;
  await stubPush(page, endpoint, { quietPrompt: true });
  const { others, url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
  const ben = others[0];

  await page.goto("/account#notifications");
  const toggle = page.getByRole("switch", { name: "Push notifications on this device" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expectToast(page, "Push notifications on");
  await expect(toggle).toBeChecked();

  await page.getByRole("button", { name: "Send a test notification" }).click();
  // The stubbed push service never reaches the real service worker, so the page reports it didn't arrive.
  await expect(page.getByRole("status").filter({ hasText: "We sent it" })).toBeVisible({ timeout: 20_000 });
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

test("after logging in, people are asked to turn on notifications (once), and 'Turn on' sets it up", async ({ page, browser }, info) => {
  const endpoint = `https://push.test/prompt-${info.testId}-${info.project.name}`;
  await stubPush(page, endpoint);
  await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
  await page.goto("/home");
  const prompt = page.getByRole("dialog", { name: "Turn on notifications?" });
  await expect(prompt).toBeVisible({ timeout: 12_000 });
  await prompt.getByRole("button", { name: "Turn on notifications" }).click();
  await expectToast(page, "Notifications on");
  await expect(prompt).toBeHidden();
  await page.goto("/account#notifications");
  await expect(page.getByRole("switch", { name: "Push notifications on this device" })).toBeChecked();
});

test("'Not now' hides the notifications prompt", async ({ page, browser }, info) => {
  await stubPush(page, `https://push.test/notnow-${info.testId}-${info.project.name}`);
  await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
  await page.goto("/home");
  const prompt = page.getByRole("dialog", { name: "Turn on notifications?" });
  await expect(prompt).toBeVisible({ timeout: 12_000 });
  await prompt.getByRole("button", { name: "Not now" }).click();
  await expect(prompt).toBeHidden();
  await page.reload();
  await page.waitForTimeout(7000);
  await expect(page.getByRole("dialog", { name: "Turn on notifications?" })).toHaveCount(0);
});
