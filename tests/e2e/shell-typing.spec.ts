import { addExpense, expenseLink, setupGroup } from "./helpers";
import { expect, test } from "./fixtures";

test("the floating Add expense button gets out of the way while typing a comment (phones)", async ({ page, browser }, info) => {
  test.skip(info.project.name !== "mobile", "the floating button only exists on phones");
  await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
  await addExpense(page, { description: "Groceries", amount: "30" });
  await expenseLink(page, "Groceries").click();
  const pill = page.locator("button", { hasText: "Add expense" }).last();
  await expect(pill).toBeVisible();
  await page.getByLabel("Add a comment").focus();
  await expect(pill).toBeHidden();
  await page.getByRole("heading", { name: "Comments" }).click(); // blur
  await expect(pill).toBeVisible();
});
