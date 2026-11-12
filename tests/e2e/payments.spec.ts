import { expect, test } from "@playwright/test";
import { addExpense, dialog, expectBeam, expectToast, settlePanel, setupGroup } from "./helpers";

test.describe("payments", () => {
  test("record a full and a partial payment from the plan, then delete one", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Lisbon trip", "Ana", "Ben", "Chloe");
    await addExpense(page, { amount: "90", description: "Dinner", paidBy: "Ben" });

    const plan = settlePanel(page);
    await expect(plan.getByText("2 payments settle everyone.")).toBeVisible();

    // Full payment: I pay Ben what I owe.
    await plan.getByRole("button", { name: "Record payment: You pay Ben $30.00" }).click();
    let sheet = dialog(page, "Settle up");
    await expect(sheet.getByLabel("From")).toHaveValue(await optionValue(sheet, "From", "You"));
    await expect(sheet.getByLabel("Amount")).toHaveValue("30.00");
    await expect(sheet.getByText("Full balance is $30.00.", { exact: false })).toBeVisible();
    await expect(sheet.getByText("You paid Ben $30.00")).toBeVisible();
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");
    await expect(sheet).toBeHidden();

    await expectBeam(page, "You", "settled up");
    await expectBeam(page, "Ben", "gets back $30.00");
    await expect(plan.getByText("1 payment settles everyone.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Expenses" }).getByText("You paid Ben")).toBeVisible();

    // Partial payment: Chloe pays Ben $10 of $30.
    await plan.getByRole("button", { name: "Record payment: Chloe pays Ben $30.00" }).click();
    sheet = dialog(page, "Settle up");
    await sheet.getByLabel("Amount").fill("10");
    await sheet.getByLabel("Note (optional)").fill("Cash at the airport");
    await expect(sheet.getByText("Chloe paid Ben $10.00")).toBeVisible();
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");

    await expectBeam(page, "Chloe", "owes $20.00");
    await expectBeam(page, "Ben", "gets back $20.00");
    await expect(plan.getByRole("button", { name: "Record payment: Chloe pays Ben $20.00" })).toBeVisible();

    // Delete the partial payment: Chloe owes the full $30 again.
    // The payment row opens its details; deleting is a destructive button there, with a confirm step.
    await page.getByRole("region", { name: "Expenses" }).getByRole("button", { name: /Chloe paid Ben/ }).click();
    const payment = dialog(page, "Payment");
    await expect(payment).toContainText("Cash at the airport");
    await payment.getByRole("button", { name: "Delete payment" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete payment" }).click();
    await expectToast(page, "Payment deleted");
    await expect(payment).toBeHidden();
    // The row that opened it is gone, so focus lands on the page heading rather than <body>.
    await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
    await expectBeam(page, "Chloe", "owes $30.00");
    await expectBeam(page, "Ben", "gets back $30.00");
  });

  test("record a different payment with validation", async ({ page, browser }, info) => {
    await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    await addExpense(page, { amount: "40", description: "Internet" });
    await expectBeam(page, "Ben", "owes $20.00");

    await settlePanel(page).getByRole("button", { name: "Record a different payment" }).click();
    const sheet = dialog(page, "Settle up");
    await sheet.getByLabel("From").selectOption({ label: "Ben" });
    await expect(sheet.getByLabel("To")).toHaveValue(await optionValue(sheet, "To", "You"));
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expect(sheet.getByText("Enter an amount greater than zero.")).toBeVisible();
    await sheet.getByLabel("Amount").fill("20");
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");
    await expectBeam(page, "Ben", "settled up");
    await expect(settlePanel(page).getByText("Everyone is settled up.")).toBeVisible();
  });
});

async function optionValue(scope: import("@playwright/test").Locator, label: string, option: string) {
  return scope.getByLabel(label).locator("option", { hasText: new RegExp(`^${option}$`) }).getAttribute("value") as Promise<string>;
}
