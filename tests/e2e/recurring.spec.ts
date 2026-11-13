import type { APIRequestContext, Page } from "@playwright/test";
import { CRON_SECRET } from "../../playwright.config";
import { expect, test } from "./fixtures";
import { dialog, expenseSheet, expectToast, fillExpense, setupGroup, setupUsers, shellAddExpense, signedIn } from "./helpers";
import { mailsTo, waitForMail } from "./mail";

/** yyyy-mm-dd, `days` from today in UTC (the daily job's calendar). */
function utcDay(days = 0): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)).toISOString().slice(0, 10);
}
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
/** Same as the app's shortDate: "Nov 16", with the year when it isn't this year. */
const short = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(date.slice(0, 4) === String(new Date().getFullYear()) ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(new Date(date));

async function runCron(request: APIRequestContext) {
  const res = await request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(res.status()).toBe(200);
  const body = (await res.json()) as { ok: boolean; date: string; recurring: { schedules: number; created: number; paused: number } };
  expect(body.ok).toBe(true);
  return body;
}

/** Ledger rows (links) in the group's Expenses section for this description. */
function ledgerRows(page: Page, description: string) {
  return page.getByRole("region", { name: "Expenses" }).getByRole("link").filter({ hasText: description });
}

function recurringRow(page: Page, description: string) {
  return page.getByRole("region", { name: "Recurring" }).getByRole("listitem").filter({ hasText: description });
}

/** "Nov 16, 2026": the end-date error always names the year. */
const longDay = (date: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(date));

/** The live sentence under Repeat: back-dated weeks that already passed are not added. */
function weeklySentence(date: string) {
  const today = utcDay(0);
  let next = date;
  do next = new Date(Date.parse(`${next}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  while (next < today);
  const firstRepeatPassed = new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10) < today;
  return firstRepeatPassed
    ? `Repeats every ${weekday(date)}, next on ${short(next)}. Weeks already past aren't added.`
    : `Repeats every ${weekday(date)}, starting ${short(date)}. We'll add it automatically.`;
}

/** Adds a weekly expense from the shell sheet, checking the live "Repeats …" sentence. */
async function addWeekly(page: Page, description: string, amount: string, date: string) {
  await shellAddExpense(page).click();
  const sheet = expenseSheet(page);
  await expect(sheet).toBeVisible();
  await fillExpense(sheet, { amount, description, date });
  await sheet.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Weekly" }).click();
  await expect(sheet.getByLabel("Every")).toHaveValue("1");
  await expect(sheet.getByText(weeklySentence(date))).toBeVisible();
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expectToast(page, "Recurring expense saved");
  await expect(sheet).toBeHidden();
}

test.describe("recurring expenses", () => {
  test("a back-dated weekly expense doesn't back-fill; the daily job adds it idempotently, and it can be paused, resumed and stopped", async ({ page, browser }, info) => {
    test.setTimeout(90_000);
    const { others } = await setupGroup(page, browser, info, "House", "Ana", "Ben");
    const [ben] = others;
    const groupUrl = page.url();

    // An end date before the first date is caught in the sheet.
    await shellAddExpense(page).click();
    const sheet = expenseSheet(page);
    await fillExpense(sheet, { amount: "10", description: "Nope", date: utcDay(-3) });
    await sheet.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Weekly" }).click();
    await sheet.getByLabel("Ends (optional)").fill(utcDay(-10));
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expect(sheet.getByText("Choose a date on or after the expense date.")).toBeVisible();
    await expect(sheet.getByLabel("Ends (optional)")).toBeFocused();
    // So is an end date before the first repeat (it would never repeat).
    await sheet.getByLabel("Ends (optional)").fill(utcDay(-1));
    await sheet.getByRole("button", { name: "Save expense" }).click();
    await expect(sheet.getByText(`It would end before it repeats. Choose ${longDay(utcDay(4))} or later, or leave it empty.`)).toBeVisible();
    await expect(sheet.getByLabel("Ends (optional)")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    // Rent from three weeks ago; Cleaning from two weeks ago. The weeks in between are already past,
    // so they aren't added: both next repeat today.
    const rentStart = utcDay(-21);
    await addWeekly(page, "Rent", "100", rentStart);
    await addWeekly(page, "Cleaning", "40", utcDay(-14));

    // Only the first occurrence exists so far, and it's labelled.
    await expect(ledgerRows(page, "Rent")).toHaveCount(1);
    await expect(ledgerRows(page, "Rent").getByRole("img", { name: "Recurring" })).toBeVisible();
    await expect(recurringRow(page, "Rent")).toContainText(`Every ${weekday(rentStart)}`);
    await expect(recurringRow(page, "Rent")).toContainText(`Next ${short(utcDay(0))}`);

    // The expense page has the Repeats row.
    await ledgerRows(page, "Rent").click();
    await expect(page.getByRole("heading", { level: 1, name: "Rent" })).toBeVisible();
    await expect(page.getByText("Repeats", { exact: true })).toBeVisible();
    await expect(page.getByText(`Every ${weekday(rentStart)}`, { exact: true })).toBeVisible();
    await expect(page.getByText(`Next on ${short(utcDay(0))}.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    const rentUrl = page.url();
    // Deleting this one says the schedule keeps going.
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("alertdialog", { name: "Delete this expense?" })).toContainText(
      `This deletes only this one. It keeps repeating every ${weekday(rentStart)}. To stop future ones, use Stop repeating.`,
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("alertdialog")).toHaveCount(0);

    // Pause Cleaning from the group's Recurring list before the job runs, by keyboard: focus comes
    // back to the menu button once it's done.
    await page.goto(groupUrl);
    const cleaningMenu = page.getByRole("button", { name: "Options for Cleaning" });
    await cleaningMenu.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menuitem", { name: "Pause" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expectToast(page, "Paused");
    await expect(recurringRow(page, "Cleaning")).toContainText("Paused");
    await expect(cleaningMenu).toBeFocused();

    // The job needs the bearer secret.
    expect((await page.request.get("/api/cron/daily")).status()).toBe(401);
    expect((await page.request.get("/api/cron/daily", { headers: { Authorization: "Bearer wrong-secret" } })).status()).toBe(401);
    expect((await page.request.get("/api/cron/daily", { headers: { Authorization: CRON_SECRET } })).status()).toBe(401);
    await page.reload();
    await expect(ledgerRows(page, "Rent")).toHaveCount(1);

    // Run it: Rent adds today's (only); paused Cleaning adds nothing.
    const benMails = mailsTo(ben.email).length;
    const first = await runCron(page.request);
    expect(first.date).toBe(utcDay(0));
    expect(first.recurring.created).toBeGreaterThanOrEqual(1);
    await page.reload();
    await expect(ledgerRows(page, "Rent")).toHaveCount(2);
    await expect(ledgerRows(page, "Rent").getByRole("img", { name: "Recurring" })).toHaveCount(2);
    await expect(ledgerRows(page, "Cleaning")).toHaveCount(1);
    await expect(recurringRow(page, "Rent")).toContainText(`Next ${short(utcDay(7))}`);
    // The people in it hear about it, labelled as recurring.
    const mail = await waitForMail(ben.email, "Rent: recurring expense added", { after: benMails });
    expect(mail.text).toContain("A recurring expense, Rent, was added in House.");

    // Running again the same day creates nothing new.
    await runCron(page.request);
    await page.reload();
    await expect(ledgerRows(page, "Rent")).toHaveCount(2);
    await expect(ledgerRows(page, "Cleaning")).toHaveCount(1);

    // Resume Cleaning: missed weeks aren't back-filled; it picks up from today.
    await page.getByRole("button", { name: "Options for Cleaning" }).click();
    await page.getByRole("menuitem", { name: "Resume" }).click();
    await expectToast(page, "Resumed");
    await expect(recurringRow(page, "Cleaning")).toContainText(`Next ${short(utcDay(0))}`);
    await runCron(page.request);
    await page.reload();
    await expect(ledgerRows(page, "Cleaning")).toHaveCount(2);
    await runCron(page.request);
    await page.reload();
    await expect(ledgerRows(page, "Cleaning")).toHaveCount(2);
    await expect(ledgerRows(page, "Rent")).toHaveCount(2);

    // Activity labels the expenses the schedule made.
    await page.goto("/activity");
    await expect(page.getByRole("link").filter({ hasText: "Rent" }).first()).toContainText("Recurring.");

    // Stop Rent from the list, after confirming: it leaves the list; past expenses stay.
    await page.goto(groupUrl);
    await page.getByRole("button", { name: "Options for Rent" }).click();
    await page.getByRole("menuitem", { name: "Stop repeating" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Stop repeating “Rent”?" });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Stop repeating" }).click();
    await expectToast(page, "Stopped");
    await expect(recurringRow(page, "Rent")).toHaveCount(0);
    await expect(recurringRow(page, "Cleaning")).toHaveCount(1);
    await expect(ledgerRows(page, "Rent")).toHaveCount(2);
    await page.goto(rentUrl);
    await expect(page.getByText("Stopped. Past expenses stay; no new ones will be added.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);

    // Stop Cleaning from its expense page: the Recurring section goes away.
    await page.goto(groupUrl);
    await ledgerRows(page, "Cleaning").first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Cleaning" })).toBeVisible();
    // By keyboard, focus stays put as Pause turns into Resume.
    await page.getByRole("button", { name: "Pause" }).focus();
    await page.keyboard.press("Enter");
    await expectToast(page, "Paused");
    await expect(page.getByText("Paused. No new expenses are added until it's resumed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
    await page.getByRole("button", { name: "Resume" }).click();
    await expectToast(page, "Resumed");
    await page.getByRole("button", { name: "Stop repeating" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Stop repeating" }).click();
    await expectToast(page, "Stopped");
    await expect(page.getByText("Stopped. Past expenses stay; no new ones will be added.")).toBeVisible();
    await page.goto(groupUrl);
    await expect(page.getByRole("region", { name: "Recurring" })).toHaveCount(0);
    await runCron(page.request);
    await page.reload();
    await expect(ledgerRows(page, "Rent")).toHaveCount(2);
    await expect(ledgerRows(page, "Cleaning")).toHaveCount(2);
  });

  test("a direct expense can repeat too: both friends see it under Recurring", async ({ page, browser }, info) => {
    const { others } = await setupUsers(page, browser, info, "Ana", "Maya");
    const [maya] = others;
    await page.goto("/friends");
    await page.getByRole("button", { name: "Add friend" }).first().click();
    await dialog(page, "Add friend").getByLabel("Email").fill(maya.email);
    await dialog(page, "Add friend").getByRole("button", { name: "Add friend" }).click();
    await expectToast(page, "Friend added");
    await page.getByRole("link").filter({ hasText: "Maya" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Maya" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Recurring" })).toHaveCount(0);

    await addWeekly(page, "Gym pass", "30", utcDay(0));
    const row = recurringRow(page, "Gym pass");
    await expect(row).toContainText(`Every ${weekday(utcDay(0))}`);
    await expect(row).toContainText("You pay");
    await expect(row).toContainText(`Next ${short(utcDay(7))}`);
    await expect(page.getByRole("region", { name: "Shared history" }).getByRole("link").filter({ hasText: "Gym pass" })).toContainText("Recurring.");

    const mayaPage = await signedIn(browser, maya);
    await mayaPage.goto("/friends");
    await mayaPage.getByRole("link").filter({ hasText: "Ana" }).first().click();
    await expect(recurringRow(mayaPage, "Gym pass")).toContainText("Ana pays");
    await mayaPage.context().close();
  });
});
