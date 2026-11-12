import { expect, test } from "./fixtures";
import {
  addExpense,
  dialog,
  expectBeam,
  expectToast,
  expenseLink,
  expenseSheet,
  fillExpense,
  settlePanel,
  setupGroup,
  shellAddExpense,
  splitInput,
  watchForNotFound,
} from "./helpers";

test.describe("expenses", () => {
  test("equal split paid by someone else updates balances and the plan", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Lisbon trip", "Ana", "Ben", "Chloe");

    await addExpense(page, { amount: "90", description: "Dinner at Taberna", paidBy: "Ben" });

    await expectBeam(page, "Ben", "gets back $60.00");
    await expectBeam(page, "You", "owe $30.00");
    await expectBeam(page, "Chloe", "owes $30.00");

    const plan = settlePanel(page);
    await expect(plan.getByText("2 payments settle everyone.")).toBeVisible();
    await expect(plan.getByRole("button", { name: "Record payment: You pay Ben $30.00" })).toBeVisible();
    await expect(plan.getByRole("button", { name: "Record payment: Chloe pays Ben $30.00" })).toBeVisible();

    const row = expenseLink(page, "Dinner at Taberna");
    await expect(row).toContainText("Ben paid $90.00");
    await expect(row).toContainText("you borrowed");
    await expect(row).toContainText("$30.00");
  });

  test("exact split keeps Save disabled until it balances", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Flat", "Ana", "Ben", "Chloe");

    await shellAddExpense(page).click();
    const sheet = expenseSheet(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("In Flat")).toBeVisible();
    const save = sheet.getByRole("button", { name: "Save expense" });
    await expect(save).toBeDisabled();

    await fillExpense(sheet, { amount: "50", description: "Taxi", mode: "Exact" });
    await expect(sheet.getByText("$50.00 left to assign")).toBeVisible();
    await expect(save).toBeDisabled();

    await splitInput(sheet, "Exact", "You").fill("10");
    await expect(sheet.getByText("$40.00 left to assign")).toBeVisible();
    await splitInput(sheet, "Exact", "Ben").fill("25");
    await expect(sheet.getByText("$15.00 left to assign")).toBeVisible();
    await expect(save).toBeDisabled();
    await splitInput(sheet, "Exact", "Chloe").fill("20");
    await expect(sheet.getByText("$5.00 over the total")).toBeVisible();
    await expect(save).toBeDisabled();
    await splitInput(sheet, "Exact", "Chloe").fill("15");
    await expect(sheet.getByText("All assigned")).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await expectToast(page, "Expense saved");

    await expectBeam(page, "You", "get back $40.00");
    await expectBeam(page, "Ben", "owes $25.00");
    await expectBeam(page, "Chloe", "owes $15.00");
  });

  test("percent and shares splits, detail page, edit and delete", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Cabin", "Ana", "Ben", "Chloe");

    // Percent: $100 paid by Chloe, 50 / 25 / 25.
    await shellAddExpense(page).click();
    let sheet = expenseSheet(page);
    await fillExpense(sheet, { amount: "100", description: "Groceries", paidBy: "Chloe", mode: "Percent", values: { You: "50", Ben: "25" } });
    await expect(sheet.getByText("25% left to assign")).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Save expense" })).toBeDisabled();
    await splitInput(sheet, "Percent", "Chloe").fill("25");
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");
    await expectBeam(page, "Chloe", "gets back $75.00");
    await expectBeam(page, "You", "owe $50.00");
    await expectBeam(page, "Ben", "owes $25.00");

    // Shares: $60 paid by me, 1 / 2 / 3.
    await addExpense(page, { amount: "60", description: "Firewood", mode: "Shares", values: { You: "1", Ben: "2", Chloe: "3" } });
    await expectBeam(page, "You", "settled up");
    await expectBeam(page, "Ben", "owes $45.00");
    await expectBeam(page, "Chloe", "gets back $45.00");
    await expect(settlePanel(page).getByText("1 payment settles everyone.")).toBeVisible();
    await expect(settlePanel(page).getByRole("button", { name: "Record payment: Ben pays Chloe $45.00" })).toBeVisible();

    // Detail page lists each person's share.
    const groupUrl = page.url();
    await expenseLink(page, "Firewood").click();
    await expect(page.getByRole("heading", { level: 1, name: "Firewood" })).toBeVisible();
    await expect(page.getByText("You paid", { exact: true })).toBeVisible();
    await expect(page.getByText("You lent $50.00")).toBeVisible();
    await expect(page.getByText("By shares")).toBeVisible();
    const shares = page.getByRole("region", { name: "Shares" });
    await expect(shares.getByRole("listitem")).toHaveCount(3);
    await expect(shares.getByRole("listitem").filter({ hasText: "You" })).toContainText("$10.00");
    await expect(shares.getByRole("listitem").filter({ hasText: "Ben" })).toContainText("2 shares");
    await expect(shares.getByRole("listitem").filter({ hasText: "Ben" })).toContainText("$20.00");
    await expect(shares.getByRole("listitem").filter({ hasText: "Chloe" })).toContainText("$30.00");

    // Edit: the amount doubles, shares stay 1 / 2 / 3.
    await page.getByRole("button", { name: "Edit" }).click();
    sheet = expenseSheet(page);
    await expect(sheet.getByRole("heading", { name: "Edit expense" })).toBeVisible();
    await expect(sheet.getByLabel(/^Amount/)).toHaveValue("60.00");
    await expect(splitInput(sheet, "Shares", "Chloe")).toHaveValue("3");
    await sheet.getByLabel(/^Amount/).fill("120");
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");
    await expect(page.getByText("You lent $100.00")).toBeVisible();

    await page.goto(groupUrl);
    await expectBeam(page, "You", "get back $50.00");
    await expectBeam(page, "Ben", "owes $65.00");
    await expectBeam(page, "Chloe", "gets back $15.00");

    // Delete it again: back to the percent-only balances.
    await expenseLink(page, "Firewood").click();
    await page.getByRole("button", { name: "Delete" }).click();
    const sawNotFound = await watchForNotFound(page);
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete expense" }).click();
    await expectToast(page, "Expense deleted");
    await expect(page).toHaveURL(groupUrl);
    expect(await sawNotFound(), "the deleted expense's page should not flash a 404").toBe(false);
    await expect(expenseLink(page, "Firewood")).toHaveCount(0);
    await expectBeam(page, "You", "owe $50.00");
    await expectBeam(page, "Chloe", "gets back $75.00");
  });

  test("an empty group offers to add the first expense", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Book club", "Ana", "Ben");
    await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "Add expense" }).click();
    const sheet = expenseSheet(page);
    await expect(sheet.getByText("In Book club")).toBeVisible();
    await fillExpense(sheet, { amount: "12.50", description: "Coffee", exclude: ["Ben"] });
    // Only the payer is left in the split: nothing to share.
    await expect(sheet.getByRole("button", { name: "Save expense" })).toBeDisabled();
    await sheet.getByRole("checkbox", { name: "Include Ben" }).click();
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");
    await expectBeam(page, "Ben", "owes $6.25");
  });

  test("editing an old expense keeps the share of someone who has left the group", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Cabin", "Ana", "Ben", "Chloe");
    await addExpense(page, { amount: "90", description: "Grocerys" });
    await expectBeam(page, "Chloe", "owes $30.00");

    // Chloe pays her part, then leaves (removed by Ana, the admin).
    await settlePanel(page).getByRole("button", { name: "Record payment: Chloe pays you $30.00" }).click();
    await dialog(page, "Settle up").getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");
    await page.getByRole("button", { name: "Group settings" }).click();
    await dialog(page, "Group settings").getByRole("button", { name: "Remove Chloe" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove member" }).click();
    await expectToast(page, "Member removed");
    await page.keyboard.press("Escape");

    // Fix a typo: Chloe's share must survive the save.
    await expenseLink(page, "Grocerys").click();
    await page.getByRole("button", { name: "Edit" }).click();
    const sheet = expenseSheet(page);
    await expect(sheet.getByRole("checkbox", { name: "Include Chloe (left the group)" })).toBeChecked();
    await sheet.getByLabel("Description").fill("Groceries");
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");
    const shares = page.getByRole("region", { name: "Shares" });
    await expect(shares.getByRole("listitem")).toHaveCount(3);
    await expect(shares.getByRole("listitem").filter({ hasText: "Chloe" })).toContainText("$30.00");

    // Ben still owes $30, not $45.
    await page.getByRole("main").getByRole("link", { name: "Cabin" }).first().click();
    await expectBeam(page, "Ben", "owes $30.00");
  });
});
