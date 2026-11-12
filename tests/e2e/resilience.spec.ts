import { expect, test } from "./fixtures";
import { addExpense, dialog, expectToast, expenseSheet, fillExpense, setupGroup, shellAddExpense, setupUsers } from "./helpers";

test.describe("resilience and focus", () => {
  test("closing a sheet returns focus to the control that opened it", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Book club", "Ana", "Ben");
    // With an expense recorded, the empty-ledger button is gone and this is the rail button or the pill.
    await addExpense(page, { amount: "8", description: "Tea" });

    const add = shellAddExpense(page);
    await add.click();
    const sheet = expenseSheet(page);
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(add).toBeFocused();

    // Also after a successful save, which unmounts the whole form.
    await add.click();
    await fillExpense(sheet, { amount: "12", description: "Biscuits" });
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");
    await expect(sheet).toBeHidden();
    await expect(add).toBeFocused();

    const settings = page.getByRole("button", { name: "Group settings" });
    await settings.click();
    await dialog(page, "Group settings").getByRole("button", { name: "Close" }).click();
    await expect(settings).toBeFocused();
  });

  test("a save that can't reach the server keeps the form and says so", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Allotment", "Ana", "Ben");
    await shellAddExpense(page).click();
    const sheet = expenseSheet(page);
    await fillExpense(sheet, { amount: "30", description: "Seeds" });

    await page.context().setOffline(true);
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expect(sheet.getByRole("alert")).toHaveText("Couldn't reach BillSplit. Check your connection and try again.");
    await expect(sheet.getByLabel("Description")).toHaveValue("Seeds");
    await expect(page.getByRole("heading", { name: "This page didn't load" })).toHaveCount(0);

    await page.context().setOffline(false);
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");
    await expect(sheet).toBeHidden();
  });

  test("a sheet form moves focus to the field that needs fixing", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    await page.getByRole("complementary", { name: "Balances and settle up" }).getByRole("button", { name: "Record a payment" }).click();
    const sheet = dialog(page, "Settle up");
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expect(sheet.getByLabel("Amount")).toBeFocused();
    await expect(sheet.getByLabel("Amount")).toHaveAccessibleDescription("Enter an amount greater than zero.");
  });

  test("a cross-site GET to /logout doesn't sign you out", async ({ page, browser }, info) => {
    await setupUsers(page, browser, info, "Ana");
    await page.goto("/logout");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/account");
    await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeVisible();
  });
});
