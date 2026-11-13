import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addExpense, addMember, createGroup, dialog, expenseSheet, fillExpense, setupGroup, shellAddExpense, signedIn } from "./helpers";

function results(page: Page) {
  return page.getByRole("region", { name: "Matching expenses" });
}

const SEEDED = ["Taxi to the airport", "Taxi home", "Pizza night", "Taxi secret"];

/** Which of the seeded descriptions are currently listed as search results (in SEEDED order). */
async function resultTitles(page: Page): Promise<string[]> {
  const texts = await results(page).getByRole("link").allInnerTexts();
  expect(texts.length, "every result row is one of the seeded expenses").toBe(texts.filter((t) => SEEDED.some((d) => t.includes(d))).length);
  return SEEDED.filter((d) => texts.some((t) => t.split("\n").some((line) => line.trim() === d)));
}

function searchBox(page: Page) {
  return page.getByRole("searchbox", { name: "Search expenses" });
}

function status(page: Page) {
  return page.getByRole("region", { name: "Search results" }).getByRole("status");
}

test.describe("search on Activity", () => {
  test("typing filters, filters narrow, the URL keeps it across reload, clearing restores the feed, and other groups never show", async ({ page, browser }, info) => {
    test.setTimeout(120_000);
    const { others } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben", "Chloe");
    const [ben, chloe] = others;

    await addExpense(page, { amount: "30", description: "Taxi to the airport", category: "Transport", date: "2026-09-05" });
    await addExpense(page, { amount: "12", description: "Taxi home", category: "Transport", paidBy: "Ben", date: "2026-10-10" });
    await addExpense(page, { amount: "24", description: "Pizza night", category: "Food and drink", date: "2026-10-12" });

    // Ben and Chloe share a group Ana isn't in, with a taxi of its own.
    const benPage = await signedIn(browser, ben);
    await createGroup(benPage, "Ben and Chloe");
    await addMember(benPage, chloe.email);
    await addExpense(benPage, { amount: "50", description: "Taxi secret", category: "Transport" });
    await benPage.context().close();

    await page.goto("/activity");
    await expect(page.getByRole("region", { name: "Activity" })).toContainText("Pizza night");

    // Typing searches (after a short pause) and writes the query into the URL.
    await searchBox(page).fill("taxi");
    await expect(status(page)).toHaveText("2 expenses");
    await expect(page).toHaveURL(/\/activity\?q=taxi$/);
    expect(await resultTitles(page)).toEqual(["Taxi to the airport", "Taxi home"]);
    await expect(results(page)).not.toContainText("Taxi secret");

    // Paid by: others narrows it to Ben's taxi.
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    let sheet = dialog(page, "Filters");
    await sheet.getByRole("radio", { name: "Others" }).click();
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("button", { name: "Filters (1)" })).toBeVisible();
    await expect(status(page)).toHaveText("1 expense");
    expect(await resultTitles(page)).toEqual(["Taxi home"]);
    await expect(page).toHaveURL(/paid=others/);

    // Reload: the server renders the same results from the URL.
    await page.reload();
    await expect(searchBox(page)).toHaveValue("taxi");
    await expect(status(page)).toHaveText("1 expense");
    expect(await resultTitles(page)).toEqual(["Taxi home"]);
    await expect(page.getByRole("button", { name: /^Remove filter: / })).toHaveCount(1);

    // Removing the chip widens it again.
    await page.getByRole("button", { name: "Remove filter: Paid by others" }).click();
    await expect(status(page)).toHaveText("2 expenses");

    // Category and a date range, without a query.
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.getByRole("button", { name: "Filters", exact: true }).click();
    sheet = dialog(page, "Filters");
    await sheet.getByLabel("Category").selectOption({ label: "Transport" });
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(status(page)).toHaveText("2 expenses");
    await page.getByRole("button", { name: "Filters (1)" }).click();
    sheet = dialog(page, "Filters");
    await sheet.getByLabel("From").fill("2026-10-01");
    await sheet.getByLabel("To").fill("2026-10-31");
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(status(page)).toHaveText("1 expense");
    expect(await resultTitles(page)).toEqual(["Taxi home"]);
    await expect(page).toHaveURL(/category=transport/);
    await expect(page).toHaveURL(/from=2026-10-01/);
    await expect(page).toHaveURL(/to=2026-10-31/);

    // A date range the wrong way round is caught in the sheet.
    await page.getByRole("button", { name: /^Filters \(\d\)$/ }).click();
    sheet = dialog(page, "Filters");
    await sheet.getByLabel("From").fill("2026-11-01");
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("To")).toHaveAttribute("aria-invalid", "true");
    await sheet.getByRole("button", { name: "Clear all" }).click();
    await sheet.getByRole("button", { name: "Show results" }).click();
    await expect(sheet).toBeHidden();

    // Nothing matches: the empty state offers to clear.
    await searchBox(page).fill("no such thing anywhere");
    await expect(page.getByRole("heading", { name: "No matching expenses" })).toBeVisible();
    await page.getByRole("button", { name: "Clear search", exact: true }).last().click();

    // Back to the feed, with a clean URL.
    await expect(page.getByRole("region", { name: "Activity" })).toContainText("Pizza night");
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByRole("region", { name: "Search results" })).toHaveCount(0);

    // The other group's taxi is never offered, even when searched for by name.
    await searchBox(page).fill("secret");
    await expect(page.getByRole("heading", { name: "No matching expenses" })).toBeVisible();
  });

  test("more than one page of results: 'Show more' loads the rest", async ({ page, browser }, info) => {
    test.setTimeout(240_000);
    await setupGroup(page, browser, info, "Coffee club", "Ana", "Ben");
    // 32 coffees: the first page holds 30.
    for (let i = 1; i <= 32; i++) {
      await shellAddExpense(page).click();
      const sheet = expenseSheet(page);
      await fillExpense(sheet, { amount: String(3 + (i % 5)), description: `Coffee ${String(i).padStart(2, "0")}` });
      await sheet.getByRole("button", { name: "Save expense" }).click();
      await expect(sheet).toBeHidden();
    }
    await addExpense(page, { amount: "9", description: "Croissants" });

    await page.goto("/activity?q=coffee");
    await expect(status(page)).toHaveText("More than 30 expenses");
    await expect(results(page).getByRole("link")).toHaveCount(30);
    await page.getByRole("button", { name: "Show more" }).click();
    await expect(status(page)).toHaveText("32 expenses");
    await expect(results(page).getByRole("link")).toHaveCount(32);
    await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
    // Focus moves to the first new row.
    await expect(results(page).getByRole("link").nth(30)).toBeFocused();
    await expect(results(page)).not.toContainText("Croissants");
  });
});
