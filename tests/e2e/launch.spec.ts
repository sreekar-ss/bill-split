import type { Page } from "@playwright/test";
import { makeUser, register } from "./helpers";
import { expect, test } from "./fixtures";

/** The launch screen leaves this mark in the tab's sessionStorage before it loads the real page. */
const launched = (page: Page) => page.evaluate(() => sessionStorage.getItem("bs-launch"));

test("opening the app shows the launch screen once, then the page; navigating inside the app never does", async ({ page }, info) => {
  await register(page, makeUser(info, "Ana"));
  // The app's service worker takes control of the signed-in page.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 15_000 });

  // Like launching the installed app: no BillSplit window is open yet.
  const app = await page.context().newPage();
  await page.close();
  await app.goto("/groups");
  await expect(app.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible();
  expect(app.url()).toMatch(/\/groups$/);
  expect(await launched(app)).toBe("1");

  // From inside the open app (a full reload, a typed URL) it goes straight to the page.
  await app.evaluate(() => sessionStorage.removeItem("bs-launch"));
  await app.reload();
  await expect(app.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible();
  await app.goto("/friends");
  await expect(app.getByRole("heading", { level: 1, name: "Friends" })).toBeVisible();
  expect(await launched(app)).toBeNull();

  // Going back doesn't land on the launch screen: it replaced itself.
  await app.goBack();
  await expect(app.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible();
});
