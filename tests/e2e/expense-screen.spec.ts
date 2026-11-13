import type { Page } from "@playwright/test";
import { addExpense, expenseLink, expenseSheet, setupGroup, shellAddExpense } from "./helpers";
import { expect, test } from "./fixtures";

/** How far the open form's content sticks out sideways (0 = it never scrolls sideways). */
async function sidewaysOverflow(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector('[role="dialog"] .overflow-y-auto') as HTMLElement;
    return body.scrollWidth - body.clientWidth;
  });
}

test.describe("Add expense on phones", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "a full screen only on phones; a dialog on desktop"));

  test("opens as its own screen that never scrolls sideways", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "A trip with quite a long group name", "Alexandria", "Bartholomew", "Christopher");
    await page.setViewportSize({ width: 320, height: 640 });
    await shellAddExpense(page).click();
    const screen = expenseSheet(page);
    await expect(screen).toBeVisible();

    // Fills the screen, edge to edge (once it has slid in).
    await expect
      .poll(async () => {
        const b = (await screen.boundingBox())!;
        return [b.x, b.y, b.width, b.height].map(Math.round);
      })
      .toEqual([0, 0, 320, 640]);
    await expect(screen.getByRole("button", { name: "Back" })).toBeVisible();

    await screen.getByLabel(/^Amount/).fill("123.45");
    for (const mode of ["Equally", "Exact", "Percent", "Shares"]) {
      await screen.getByRole("radiogroup", { name: "Split method" }).getByRole("radio", { name: mode }).click();
      expect(await sidewaysOverflow(page), `${mode} split`).toBe(0);
    }
    await screen.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Monthly" }).click();
    expect(await sidewaysOverflow(page), "with repeat fields").toBe(0);
  });

  test("the back gesture closes it and stays on the page; Back leaves history as it was", async ({ page, browser }, info) => {
    const { url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    await page.goto("/groups");
    await page.goto(url);

    await shellAddExpense(page).click();
    await expect(expenseSheet(page)).toBeVisible();
    await page.goBack();
    await expect(expenseSheet(page)).toBeHidden();
    expect(page.url()).toBe(url);

    await shellAddExpense(page).click();
    await expenseSheet(page).getByRole("button", { name: "Back" }).click();
    await expect(expenseSheet(page)).toBeHidden();
    expect(page.url()).toBe(url);
    // No leftover entry: one more back goes to the page before.
    await page.goBack();
    await expect(page).toHaveURL(/\/groups$/);
  });

  test("saving closes the screen and the new expense is listed", async ({ page, browser }, info) => {
    const { url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    await addExpense(page, { description: "Groceries", amount: "30" });
    expect(page.url()).toBe(url);
    await expect(expenseLink(page, "Groceries")).toBeVisible();
  });
});
