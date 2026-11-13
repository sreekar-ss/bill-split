import type { Page } from "@playwright/test";
import { addExpense, nav, setupGroup } from "./helpers";
import { expect, test } from "./fixtures";

/** Every client-side page request (RSC) from now on, split into preloads and real navigations. */
function watchPageRequests(page: Page) {
  const seen: { path: string; prefetch: boolean }[] = [];
  page.on("request", (req) => {
    const h = req.headers();
    if (h["rsc"]) seen.push({ path: new URL(req.url()).pathname, prefetch: Boolean(h["next-router-prefetch"]) });
  });
  return seen;
}

test.describe("navigation stays light", () => {
  test("a list of expenses doesn't preload each expense's page", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    for (const description of ["Rent", "Power", "Water"]) await addExpense(page, { amount: "30", description });

    const requests = watchPageRequests(page);
    await nav(page).getByRole("link", { name: "Activity" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Activity" })).toContainText("Water");
    // Give viewport preloading time to happen if it were going to.
    await page.waitForTimeout(1000);
    expect(requests.filter((r) => r.path.startsWith("/expenses/"))).toEqual([]);
  });

  test("going back to a tab you just visited doesn't ask the server again; saving still refreshes it", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    await nav(page).getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await nav(page).getByRole("link", { name: "Groups" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible();

    const requests = watchPageRequests(page);
    await nav(page).getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    expect(requests.filter((r) => !r.prefetch && r.path === "/home")).toEqual([]);

    // Your own save clears the cache, so the revisited tab shows it straight away.
    await page.getByRole("link").filter({ hasText: "Flat" }).first().click();
    await addExpense(page, { amount: "40", description: "Groceries" });
    await nav(page).getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await expect(page.getByRole("main")).toContainText("owes you $20.00");
  });
});
