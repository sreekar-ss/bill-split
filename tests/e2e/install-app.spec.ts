import { createGroup, dialog, makeUser, register } from "./helpers";
import { expect, test } from "./fixtures";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 Instagram 357.0.0";

test("the app is installable: manifest, icons and iPhone home-screen tags", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "BillSplit", short_name: "BillSplit", display: "standalone", start_url: "/home" });
  expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`)).toEqual([
    "192x192/any", "512x512/any", "192x192/maskable", "512x512/maskable",
  ]);
  for (const icon of manifest.icons as { src: string }[]) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()["content-type"]).toContain("image/png");
  }

  await page.goto("/login");
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(appleIcon).toBeTruthy();
  expect((await request.get(appleIcon!)).headers()["content-type"]).toContain("image/png");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "BillSplit");
});

test.describe("on an iPhone", () => {
  test.use({ userAgent: IPHONE_SAFARI, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("prompts engaged users with the Add to Home Screen steps, and 'Not now' sticks", async ({ page }, info) => {
    await register(page, makeUser(info, "Ana"));
    // Not yet engaged (no group or friend): no prompt.
    await page.waitForTimeout(4500);
    await expect(dialog(page, "Add BillSplit to your Home Screen")).toHaveCount(0);

    await createGroup(page, "Flat");
    await page.goto("/home");
    const sheet = dialog(page, "Add BillSplit to your Home Screen");
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByRole("list", { name: "How to add BillSplit to your Home Screen" }).getByRole("listitem")).toHaveCount(3);
    await expect(sheet).toContainText("in Safari's toolbar");
    await expect(sheet).toContainText("Add to Home Screen");
    await sheet.getByRole("button", { name: "Not now" }).click();
    await expect(sheet).toBeHidden();

    // Dismissed: not again on reload or in a new tab.
    await page.reload();
    await page.waitForTimeout(4500);
    await expect(dialog(page, "Add BillSplit to your Home Screen")).toHaveCount(0);

    // Still available on demand from Account.
    await page.goto("/account");
    await page.getByRole("button", { name: "Add to Home Screen" }).click();
    await expect(dialog(page, "Add BillSplit to your Home Screen")).toBeVisible();
  });

  test("in an in-app browser it explains to open Safari instead", async ({ browser }, info) => {
    const context = await browser.newContext({ userAgent: IPHONE_INSTAGRAM, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await register(page, makeUser(info, "Ina"));
    await createGroup(page, "Trip");
    await page.goto("/home");
    await page.waitForTimeout(4500);
    await expect(page.getByRole("dialog")).toHaveCount(0); // never auto-prompts here
    await page.goto("/account");
    await page.getByRole("button", { name: "Add to Home Screen" }).click();
    await expect(page.getByRole("button", { name: "Copy link for Safari" })).toBeVisible();
    await context.close();
  });
});

test("desktop never auto-prompts, but Account explains how to install on a phone", async ({ browser }, info) => {
  // A real desktop browser (the mobile project's default device would report Android).
  const context = await browser.newContext({
    viewport: { width: 1280, height: 860 },
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  });
  const page = await context.newPage();
  await register(page, makeUser(info, "Dee"));
  await createGroup(page, "Office");
  await page.goto("/home");
  await page.waitForTimeout(4500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/account");
  await page.getByRole("button", { name: "Install app" }).click();
  await expect(dialog(page, "Install BillSplit")).toContainText("On your iPhone or Android phone");
  await context.close();
});
