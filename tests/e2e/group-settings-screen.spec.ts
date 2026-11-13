import type { Page } from "@playwright/test";
import { dialog, expectNotFound, expectToast, setupGroup } from "./helpers";
import { expect, test } from "./fixtures";

function settings(page: Page) {
  return dialog(page, "Group settings");
}

async function openSettings(page: Page) {
  await page.getByRole("button", { name: "Group settings" }).click();
  await expect(settings(page)).toBeVisible();
}

/** Nothing modal is left on screen: no sheet, no confirm step. */
async function expectNoDialog(page: Page) {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
}

test.describe("Group settings on phones", () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== "mobile", "a full screen only on phones; a dialog on desktop"));

  test("opens as its own screen; the back gesture closes it and stays on the group", async ({ page, browser }, info) => {
    const { url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    await page.goto("/groups");
    await page.goto(url);

    await openSettings(page);
    const screen = settings(page);
    const { width, height } = page.viewportSize()!;
    // Fills the screen, edge to edge (once it has slid in).
    await expect
      .poll(async () => {
        const b = (await screen.boundingBox())!;
        return [b.x, b.y, b.width, b.height].map(Math.round);
      })
      .toEqual([0, 0, width, height]);
    await expect(screen.getByRole("button", { name: "Back" })).toBeVisible();
    await expect(screen.getByRole("button", { name: "Close" })).toBeHidden();

    await page.goBack();
    await expect(screen).toBeHidden();
    expect(page.url()).toBe(url);
    await expect(page.getByRole("heading", { level: 1, name: "Flat" })).toBeVisible();

    await openSettings(page);
    await screen.getByRole("button", { name: "Back" }).click();
    await expect(screen).toBeHidden();
    expect(page.url()).toBe(url);
    // No leftover entry: one more back goes to the page before.
    await page.goBack();
    await expect(page).toHaveURL(/\/groups$/);
  });

  test("after leaving a group, back returns to the group's address without a stale screen or crash", async ({ page, browser }, info) => {
    // No expenses, so Ana's balance is zero and she can leave.
    const { url } = await setupGroup(page, browser, info, "Old flat", "Ana", "Ben");
    await page.goto("/groups");
    await page.goto(url);

    await openSettings(page);
    await settings(page).getByRole("button", { name: "Leave group" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Leave group" }).click();
    await expectToast(page, "You left the group");
    await expect(page).toHaveURL(/\/groups$/);
    await expectNoDialog(page);
    await expect(page.getByRole("heading", { name: "No groups yet" })).toBeVisible();

    // The settings screen's history entry was replaced by /groups, not left behind: one back is the group itself.
    await page.goBack();
    await expect(page).toHaveURL(url);
    await expectNoDialog(page);
    await expect(page.getByRole("heading", { level: 1, name: "This page didn't load" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();

    // Ana isn't in the group any more, so its page is a 404 for her.
    await page.reload();
    await expectNotFound(page);
    await expectNoDialog(page);
  });
});
