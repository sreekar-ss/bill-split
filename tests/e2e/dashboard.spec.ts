import { expect, test } from "./fixtures";
import { addExpense, addMember, createGroup, dialog, expectToast, nav, settlePanel, setupUsers } from "./helpers";

test.describe("dashboard and activity", () => {
  test("home totals and the activity feed reflect expenses and payments", async ({ page, browser }, info) => {
    const { others } = await setupUsers(page, browser, info, "Ana", "Ben", "Chloe");
    const [ben, chloe] = others;

    await createGroup(page, "Lisbon trip");
    await addMember(page, ben.email);
    await addMember(page, chloe.email);
    // I paid $120 split three ways: Ben and Chloe owe me $40 each.
    await addExpense(page, { amount: "120", description: "Apartment deposit" });
    // Ben paid $30 split three ways: I owe Ben $10.
    await addExpense(page, { amount: "30", description: "Tram tickets", paidBy: "Ben" });
    // Chloe pays me $15.
    await settlePanel(page).getByRole("button", { name: "Record a different payment" }).click();
    const sheet = dialog(page, "Settle up");
    await sheet.getByLabel("From").selectOption({ label: "Chloe" });
    await sheet.getByLabel("To").selectOption({ label: "You" });
    await sheet.getByLabel("Amount").fill("15");
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");

    await nav(page).getByRole("link", { name: "Home" }).click();
    await expect(page).toHaveURL(/\/home$/);
    // Group nets: me +55, Ben −20, Chloe −35. Debts are simplified within the group, so the plan
    // (and the per-person view) is Ben pays me $20 and Chloe pays me $35.
    const summary = page.getByRole("region", { name: "Your balance" });
    await expect(summary).toContainText("Overall, you're owed");
    await expect(summary).toContainText("$55.00");
    const people = page.getByRole("list", { name: "Your balance with each person" });
    await expect(people.getByRole("listitem").filter({ hasText: "Ben" })).toContainText("owes you $20.00");
    await expect(people.getByRole("listitem").filter({ hasText: "Chloe" })).toContainText("owes you $35.00");
    await expect(page.getByRole("region", { name: "Groups" }).getByRole("link").filter({ hasText: "Lisbon trip" })).toContainText(
      "you're owed $55.00",
    );
    const recent = page.getByRole("list", { name: "Recent activity" });
    await expect(recent).toContainText("Tram tickets");
    await expect(recent).toContainText("Chloe paid you");

    await page.getByRole("link", { name: "All activity" }).click();
    await expect(page).toHaveURL(/\/activity$/);
    const feed = page.getByRole("main");
    await expect(feed.getByRole("link").filter({ hasText: "Apartment deposit" })).toContainText("You paid $120.00 in Lisbon trip");
    await expect(feed.getByRole("link").filter({ hasText: "Apartment deposit" })).toContainText("you lent $80.00");
    await expect(feed.getByRole("link").filter({ hasText: "Tram tickets" })).toContainText("Ben paid $30.00 in Lisbon trip");
    await expect(feed.getByRole("link").filter({ hasText: "Tram tickets" })).toContainText("you borrowed $10.00");
    await expect(feed.getByText("Chloe paid you")).toBeVisible();
    await expect(feed.getByText("Payment in Lisbon trip")).toBeVisible();

    // Ben sees the mirror image.
    const benCtx = await browser.newContext();
    const benPage = await benCtx.newPage();
    await benPage.goto("/login");
    await benPage.getByLabel("Email", { exact: true }).fill(ben.email);
    await benPage.getByLabel("Password", { exact: true }).fill(ben.password);
    await benPage.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(benPage).toHaveURL(/\/home$/);
    const benSummary = benPage.getByRole("region", { name: "Your balance" });
    await expect(benSummary).toContainText("Overall, you owe");
    await expect(benSummary).toContainText("$20.00");
    await benCtx.close();
  });

  test("balances in different currencies are shown separately, never added up", async ({ page, browser }, info) => {
    const { others } = await setupUsers(page, browser, info, "Ana", "Ben");
    const [ben] = others;
    await createGroup(page, "Porto weekend", "EUR");
    await addMember(page, ben.email);
    await addExpense(page, { amount: "90", description: "Hotel" });
    // Ben is also a friend now (added via the group); a direct USD expense he paid.
    await page.goto("/friends");
    await page.getByRole("link").filter({ hasText: "Ben" }).click();
    await addExpense(page, { amount: "20", description: "Lunch", paidBy: "Ben" });

    await page.goto("/home");
    const summary = page.getByRole("region", { name: "Your balance" });
    await expect(summary).toContainText("In USD, you owe");
    await expect(summary).toContainText("$10.00");
    await expect(summary).toContainText("In EUR, you're owed");
    await expect(summary).toContainText("€45.00");
    // One beam per currency, so bars are only compared within a currency.
    const usd = page.getByRole("list", { name: "Your balance with each person in USD" });
    const eur = page.getByRole("list", { name: "Your balance with each person in EUR" });
    await expect(usd).toContainText("Ben you owe $10.00");
    await expect(usd).not.toContainText("€");
    await expect(eur).toContainText("Ben owes you €45.00");
    await expect(eur).not.toContainText("$");

    await page.goto("/friends");
    const row = page.getByRole("link").filter({ hasText: "Ben" });
    await expect(row).toContainText("owes you €45.00");
    await expect(row).toContainText("you owe $10.00");

    await row.click();
    const balance = page.getByRole("region", { name: /^Your balance with Ben/ });
    // The default currency (USD) leads; other currencies follow as a sentence.
    await expect(balance).toContainText("You owe Ben");
    await expect(balance).toContainText("Also, Ben owes you €45.00");
    // Settle the USD part directly: the EUR group balance is untouched.
    await page.getByRole("button", { name: "Settle up in Direct expenses" }).click();
    const sheet = dialog(page, "Settle up");
    await expect(sheet.getByLabel("Amount")).toHaveValue("10.00");
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");
    await expect(balance).not.toContainText("$10.00");
    await expect(balance).toContainText("€45.00");
  });

  test("an empty activity feed explains itself", async ({ page, browser }, info) => {
    await setupUsers(page, browser, info, "Ana");
    await page.goto("/activity");
    await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  });
});
