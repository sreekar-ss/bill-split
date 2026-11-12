import { expect, test } from "@playwright/test";
import {
  addExpense,
  addMember,
  createGroup,
  dialog,
  expectBeam,
  expectNotFound,
  expectToast,
  makeUser,
  register,
  setupGroup,
  setupUsers,
  watchForNotFound,
} from "./helpers";

test.describe("groups", () => {
  test("create a group and add two members by email", async ({ page, browser }, info) => {
    const { others } = await setupUsers(page, browser, info, "Ana", "Ben", "Chloe");
    const [ben, chloe] = others;

    await page.goto("/groups");
    await expect(page.getByRole("heading", { name: "No groups yet" })).toBeVisible();

    await createGroup(page, "Flat 3B");
    await expect(page.getByText("1 member")).toBeVisible();
    await expect(page.getByText("Add a member to start splitting costs.")).toBeVisible();
    // A group of one has nobody to settle with or split with: the empty ledger asks for a member.
    await expect(page.getByRole("heading", { name: "Settle up" })).toHaveCount(0);
    const expenses = page.getByRole("region", { name: "Expenses" });
    await expect(expenses.getByRole("button", { name: "Add expense" })).toHaveCount(0);
    await expenses.getByRole("button", { name: "Add member" }).click();
    const sheet = dialog(page, "Add member");
    await sheet.getByLabel("Email").fill(ben.email);
    await sheet.getByRole("button", { name: "Add member" }).click();
    await expectToast(page, "Member added");
    await expect(sheet).toBeHidden();
    await expect(page.getByText("2 members")).toBeVisible();
    await expect(expenses.getByRole("button", { name: "Add expense" })).toBeVisible();

    await addMember(page, chloe.email);
    await expect(page.getByText("3 members")).toBeVisible();
    await expect(page.getByText("You, Ben and Chloe")).toBeVisible();
    await expect(page.getByText("Everyone is settled up.")).toBeVisible();

    // The group shows on the list with a settled balance and member names.
    await page.goto("/groups");
    const row = page.getByRole("link").filter({ hasText: "Flat 3B" });
    await expect(row).toContainText("settled up");

    // Adding a member also made them friends.
    await page.goto("/friends");
    await expect(page.getByRole("link").filter({ hasText: "Ben" })).toBeVisible();
    await expect(page.getByRole("link").filter({ hasText: "Chloe" })).toBeVisible();
  });

  test("adding an unknown email or an existing member shows the error", async ({ page, browser }, info) => {
    const { others } = await setupUsers(page, browser, info, "Ana", "Ben");
    await createGroup(page, "Climbing club");
    await addMember(page, others[0].email);

    await page.getByRole("button", { name: "Add member" }).first().click();
    const sheet = dialog(page, "Add member");
    await sheet.getByLabel("Email").fill(`nobody.${Date.now()}@example.test`);
    await sheet.getByRole("button", { name: "Add member" }).click();
    await expect(sheet.getByRole("alert").filter({ hasText: "That email doesn't have a BillSplit account yet." })).toBeVisible();
    await expect(sheet).toBeVisible();

    await sheet.getByLabel("Email").fill(others[0].email);
    await sheet.getByRole("button", { name: "Add member" }).click();
    await expect(sheet.getByText("Ben is already in this group.")).toBeVisible();
  });

  test("rename a group in settings, then delete it", async ({ page, browser }, info) => {
    await setupUsers(page, browser, info, "Ana");
    await createGroup(page, "Ski weekend");
    await page.getByRole("button", { name: "Group settings" }).click();
    const sheet = dialog(page, "Group settings");
    await sheet.getByLabel("Group name").fill("Ski week");
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Changes saved");
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ski week" })).toBeVisible();

    await page.getByRole("button", { name: "Group settings" }).click();
    await dialog(page, "Group settings").getByRole("button", { name: "Delete group" }).click();
    const sawNotFound = await watchForNotFound(page);
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete group" }).click();
    await expectToast(page, "Group deleted");
    await expect(page).toHaveURL(/\/groups$/);
    expect(await sawNotFound(), "the deleted group's page should not flash a 404").toBe(false);
    await expect(page.getByRole("heading", { name: "No groups yet" })).toBeVisible();
  });

  test("a group's currency is fixed once used, and it can't be deleted with open balances", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Road trip", "Ana", "Ben");
    await addExpense(page, { amount: "40", description: "Fuel" });

    await page.getByRole("button", { name: "Group settings" }).click();
    const sheet = dialog(page, "Group settings");
    await expect(sheet.getByLabel("Currency")).toBeDisabled();
    await expect(sheet.getByText("The currency can't change once the group has expenses or payments.")).toBeVisible();

    await sheet.getByRole("button", { name: "Delete group" }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText("Settle up everyone before deleting the group.");
    await confirm.getByRole("button", { name: "Delete group" }).click();
    await expect(confirm.getByRole("alert")).toHaveText("Settle up everyone's balance before deleting this group.");
    await confirm.getByRole("button", { name: "Cancel" }).click();
    // Focus goes back to the button that opened the dialog.
    await expect(sheet.getByRole("button", { name: "Delete group" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: "Group settings" })).toBeFocused();
    await expectBeam(page, "Ben", "owes $20.00");
  });

  test("a group you aren't in is a 404", async ({ page, browser }, info) => {
    const outsider = await browser.newContext();
    const op = await outsider.newPage();
    await register(op, makeUser(info, "Ola"));
    const url = await createGroup(op, "Private group");
    await outsider.close();

    await register(page, makeUser(info, "Ana"));
    // Pages stream behind loading.tsx, so the HTTP status is already sent; the not-found UI is the 404.
    await page.goto(url);
    await expectNotFound(page);
    await expect(page.getByText("Private group")).toHaveCount(0);

    await page.goto("/groups/does-not-exist");
    await expectNotFound(page);
    await page.goto("/expenses/does-not-exist");
    await expectNotFound(page);
    await page.goto("/friends/does-not-exist");
    await expectNotFound(page);
  });
});
