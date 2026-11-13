import { expect, test } from "./fixtures";
import { addExpense, expectNotFound, makeUser, register, registerElsewhere, setupGroup, signedIn } from "./helpers";

/** yyyy-mm-dd on `day` of the UTC month `offset` months from now (the insights calendar is UTC). */
function monthDay(offset: number, day: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, day)).toISOString().slice(0, 10);
}

/** "2026-10-04" -> "October 2026", as the month chart names its columns. */
function monthLong(date: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

test.describe("spending insights", () => {
  test("your share by month and category, the group's paid vs share per person, and a 404 for non-members", async ({ page, browser }, info) => {
    test.setTimeout(90_000);
    const chloe = await registerElsewhere(browser, makeUser(info, "Chloe"));
    const { url } = await setupGroup(page, browser, info, "Ski trip", "Ana", "Ben");
    const groupId = new URL(url).pathname.split("/").pop()!;

    // Last month: Ana pays 60 for groceries (her share 30). This month: Ben pays 40 for dinner (her share 20).
    const lastMonth = monthDay(-1, 10);
    const thisMonth = monthDay(0, 1);
    await addExpense(page, { amount: "60", description: "Supermarket run", category: "Groceries", date: lastMonth });
    await addExpense(page, { amount: "40", description: "Fondue dinner", category: "Food and drink", paidBy: "Ben", date: thisMonth });

    // Home leads to the personal page.
    await page.goto("/home");
    const entry = page.getByRole("region", { name: "Your spending" });
    await expect(entry).toBeVisible();
    await entry.getByRole("link", { name: "See your spending" }).click();
    await expect(page).toHaveURL(/\/insights$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your spending" })).toBeVisible();

    const summary = page.getByRole("region", { name: "Your share in the last 6 months" });
    await expect(summary).toContainText("$50.00");
    await expect(summary.getByRole("definition").first()).toHaveText("$20.00"); // This month so far
    // Only one complete month has spending, so there's no average yet: it shows last month.
    await expect(summary.getByRole("term").nth(1)).toHaveText("Last month");
    await expect(summary.getByRole("definition").nth(1)).toHaveText("$30.00");

    // The month chart's text alternative: one labelled radio per month.
    const months = page.getByRole("radiogroup", { name: "Your share by month" });
    await expect(months.getByRole("radio")).toHaveCount(6);
    await expect(months.getByRole("radio", { name: `${monthLong(lastMonth)}, $30.00` })).toBeVisible();
    await expect(months.getByRole("radio", { name: `${monthLong(thisMonth)} so far, $20.00` })).toBeChecked();

    const categories = page.getByRole("list", { name: "Your share by category" }).getByRole("listitem");
    await expect(categories).toHaveCount(2);
    await expect(categories.nth(0)).toContainText(/Groceries\s*\$30\.00\s*,?\s*60%/);
    await expect(categories.nth(1)).toContainText(/Food and drink\s*\$20\.00\s*,?\s*40%/);

    const byGroup = page.getByRole("list", { name: "Your share by group" }).getByRole("listitem");
    await expect(byGroup).toHaveCount(1);
    await expect(byGroup.first()).toContainText("Ski trip");
    await expect(byGroup.first()).toContainText("$50.00");

    // 12 months keeps the same totals, with the period in the URL.
    await page.getByRole("link", { name: /12 months/ }).click();
    await expect(page).toHaveURL(/\/insights\?months=12$/);
    await expect(page.getByRole("region", { name: "Your share in the last 12 months" })).toContainText("$50.00");
    await expect(page.getByRole("radiogroup", { name: "Your share by month" }).getByRole("radio")).toHaveCount(12);

    // The group row opens the group's spending page.
    await page.getByRole("list", { name: "Your share by group" }).getByRole("link", { name: /Ski trip/ }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/insights`));
    await expect(page.getByRole("heading", { level: 1, name: "Group spending" })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Spent in the last/ })).toContainText("$100.00");

    const groupCategories = page.getByRole("list", { name: "Group spending by category" }).getByRole("listitem");
    await expect(groupCategories.nth(0)).toContainText(/Groceries\s*\$60\.00/);
    await expect(groupCategories.nth(1)).toContainText(/Food and drink\s*\$40\.00/);

    const people = page.getByRole("list", { name: "Paid and share by person" }).getByRole("listitem");
    await expect(people).toHaveCount(2);
    const you = people.filter({ hasText: "You paid" });
    await expect(you).toContainText("You paid $10.00 more than your share");
    await expect(you).toContainText(/Paid\s*\$60\.00/);
    await expect(you).toContainText(/Share\s*\$50\.00/);
    const ben = people.filter({ hasText: "Ben" });
    await expect(ben).toContainText("Paid $10.00 less than their share");
    await expect(ben).toContainText(/Paid\s*\$40\.00/);
    await expect(ben).toContainText(/Share\s*\$50\.00/);

    // The group page links to the same place.
    await page.goto(url);
    await page.getByRole("link", { name: "Spending" }).click();
    await expect(page).toHaveURL(new RegExp(`/groups/${groupId}/insights$`));

    // Someone outside the group gets the not-found page, with a 404 status.
    const outsider = await signedIn(browser, chloe);
    const res = await outsider.goto(`/groups/${groupId}/insights`);
    expect(res?.status()).toBe(404);
    await expectNotFound(outsider);
    await outsider.context().close();
  });

  test("with nothing shared yet, the page says so and points to groups", async ({ page }, info) => {
    await register(page, makeUser(info, "Ivy"));
    await page.goto("/insights");
    await expect(page.getByRole("heading", { name: "Nothing to show yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Go to your groups" })).toHaveAttribute("href", "/groups");
    // Home hides the spending section until there's something in it.
    await page.goto("/home");
    await expect(page.getByRole("region", { name: "Your spending" })).toHaveCount(0);
  });
});
