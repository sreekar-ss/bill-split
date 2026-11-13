import { mkdirSync, rmSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  addExpense,
  addMember,
  createGroup,
  dialog,
  expectToast,
  expenseLink,
  expenseSheet,
  fillExpense,
  login,
  makeUser,
  nav,
  register,
  registerElsewhere,
  settlePanel,
  shellAddExpense,
  splitInput,
} from "./helpers";
import { CRON_SECRET } from "../../playwright.config";
import { linkFor, unsubscribeLink, waitForMail } from "./mail";

/** yyyy-mm-dd, `days` from today in UTC (the daily job's calendar). */
function utcDay(days = 0): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days)).toISOString().slice(0, 10);
}

/**
 * Seeds a realistic dataset through the UI and saves a screenshot of every screen to
 * reports/screens/<project>/<nn-name>.png. Opt-in: SCREENS=1 npx playwright test tests/e2e/screens.spec.ts
 */
test.skip(!process.env.SCREENS, "Screenshots only run with SCREENS=1");

// Hide transient chrome (toasts, caret) so screenshots are stable.
const SHOT_STYLE = "[data-sonner-toaster]{display:none !important} *{caret-color:transparent !important}";

test("capture every screen", async ({ page, browser }, info) => {
  test.setTimeout(420_000);
  const dir = `reports/screens/${info.project.name}`;
  // Start clean so renumbered screens don't leave stale files behind.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const shot = async (name: string, opts: { fullPage?: boolean; target?: Page } = {}) => {
    const p = opts.target ?? page;
    await p.waitForLoadState("networkidle");
    // Let entrance animations (sheet slide, beam grow) settle.
    await p.waitForTimeout(450);
    n += 1;
    const path = `${dir}/${String(n).padStart(2, "0")}-${name}.png`;
    if (opts.fullPage === false) {
      await p.screenshot({ path, animations: "disabled", style: SHOT_STYLE });
      return;
    }
    // Grow the viewport to the page height instead of using Playwright's stitched fullPage mode,
    // so fixed chrome (mobile tab bar, add pill) sits at the bottom as it would on a real screen.
    const original = p.viewportSize()!;
    const height = await p.evaluate(() => document.documentElement.scrollHeight);
    await p.setViewportSize({ width: original.width, height: Math.max(original.height, height) });
    await p.waitForTimeout(150);
    await p.screenshot({ path, animations: "disabled", style: SHOT_STYLE });
    await p.setViewportSize(original);
  };

  // --- Signed out ------------------------------------------------------------------------
  await page.goto("/");
  await shot("landing");
  await page.goto("/login");
  await shot("login");
  await page.goto("/register");
  await shot("register");

  // --- Seed ------------------------------------------------------------------------------
  const ben = await registerElsewhere(browser, makeUser(info, "Ben"));
  const chloe = await registerElsewhere(browser, makeUser(info, "Chloe"));
  const dev = await registerElsewhere(browser, makeUser(info, "Dev"));
  const maya = await registerElsewhere(browser, makeUser(info, "Maya"));
  // Ben has saved payment handles, so paying him offers deep links (PayPal works in EUR).
  {
    const ctx = await browser.newContext();
    const benPage = await ctx.newPage();
    await benPage.goto("/login");
    await login(benPage, ben.email, ben.password);
    await expect(benPage).toHaveURL(/\/home$/);
    await benPage.goto("/account");
    await benPage.getByLabel("Venmo username").fill("ben-silva");
    await benPage.getByLabel("PayPal.me name").fill("bensilva");
    await benPage.getByRole("button", { name: "Save payment details" }).click();
    await expectToast(benPage, "Payment details saved");
    await ctx.close();
  }
  const me = makeUser(info, "Ana");
  me.name = "Ana Lima";
  await register(page, me, { verify: false });

  // Fresh sign-up: the confirm-your-email banner sits above Home. Then confirm, so the rest is clean.
  await expect(page.getByRole("region", { name: "Confirm your email" })).toBeVisible();
  await shot("home-verify-banner", { fullPage: false });
  await page.goto(await linkFor(me.email, "/verify-email"));
  await expect(page.getByRole("heading", { level: 1, name: "Email confirmed" })).toBeVisible();

  const groupUrl = await createGroup(page, "Lisbon trip", "EUR");
  for (const u of [ben, chloe, dev]) await addMember(page, u.email);
  {
    await page.getByRole("button", { name: "Group settings" }).click();
    const settings = dialog(page, "Group settings");
    await settings.locator("label").filter({ has: page.getByRole("radio", { name: "Plane" }) }).click();
    await settings.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Changes saved");
    await settings.getByRole("button", { name: "Close" }).click();
    await expect(settings).toBeHidden();
  }

  await addExpense(page, { amount: "640", description: "Apartment in Alfama", category: "Travel", date: "2026-10-03" });
  // Ben records the dinner he paid for himself. Having dealt with the group, his payment handles now show to Ana.
  {
    const ctx = await browser.newContext();
    const benPage = await ctx.newPage();
    await benPage.goto("/login");
    await login(benPage, ben.email, ben.password);
    await expect(benPage).toHaveURL(/\/home$/);
    await benPage.goto(groupUrl);
    await addExpense(benPage, { amount: "186.40", description: "Dinner at Taberna", category: "Food and drink", date: "2026-10-04" });
    await ctx.close();
  }
  await page.reload();
  await addExpense(page, {
    amount: "240",
    description: "Surf lessons",
    paidBy: "Chloe",
    mode: "Exact",
    values: { You: "90", Ben: "50", Chloe: "50", Dev: "50" },
    date: "2026-10-05",
  });
  await addExpense(page, {
    amount: "92.30",
    description: "Groceries for the flat",
    paidBy: "Dev",
    mode: "Shares",
    values: { You: "2", Ben: "1", Chloe: "1", Dev: "1" },
    category: "Groceries",
    date: "2026-10-06",
  });
  await addExpense(page, {
    amount: "120",
    description: "Fado night tickets",
    mode: "Percent",
    values: { You: "40", Ben: "20", Chloe: "20", Dev: "20" },
    category: "Entertainment",
    date: "2026-10-07",
  });
  await addExpense(page, { amount: "38.60", description: "Taxi from the airport", paidBy: "Dev", exclude: ["Chloe"], category: "Transport", date: "2026-10-02" });

  // A weekly co-working desk, started two weeks ago; past weeks aren't back-filled, and the daily job adds today's.
  await shellAddExpense(page).click();
  let sheet = expenseSheet(page);
  await fillExpense(sheet, { amount: "45", description: "Co-working desk", category: "General", date: utcDay(-14) });
  await sheet.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Weekly" }).click();
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expectToast(page, "Recurring expense saved");
  const cron = await page.request.get("/api/cron/daily", { headers: { Authorization: `Bearer ${CRON_SECRET}` } });
  expect(cron.ok()).toBe(true);
  await page.reload();

  // Dev pays me part of what he owes.
  await settlePanel(page).getByRole("button", { name: "Record a different payment" }).click();
  sheet = dialog(page, "Settle up");
  await sheet.getByLabel("From").selectOption({ label: "Dev" });
  await sheet.getByLabel("To").selectOption({ label: "You" });
  await sheet.getByLabel("Amount").fill("100");
  await sheet.getByRole("button", { name: "Record payment" }).click();
  await expectToast(page, "Payment recorded");

  // A friend with a direct expense.
  await page.goto("/friends");
  await page.getByRole("button", { name: "Add friend" }).first().click();
  await dialog(page, "Add friend").getByLabel("Email").fill(maya.email);
  await dialog(page, "Add friend").getByRole("button", { name: "Add friend" }).click();
  await expectToast(page, "Friend added");
  await page.getByRole("link").filter({ hasText: "Maya" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Maya" })).toBeVisible();
  const friendUrl = page.url();
  await addExpense(page, { amount: "84", description: "Concert tickets", paidBy: "Maya", category: "Entertainment" });
  await addExpense(page, { amount: "300", description: "Cabin weekend", category: "Travel" });
  await shellAddExpense(page).click();
  sheet = expenseSheet(page);
  await fillExpense(sheet, { amount: "16.99", description: "Music streaming", category: "Entertainment" });
  await sheet.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Monthly" }).click();
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expectToast(page, "Recurring expense saved");

  // Ben asks about the surf lessons; Ana answers.
  await page.goto(groupUrl);
  await expenseLink(page, "Surf lessons").click();
  await expect(page.getByRole("heading", { level: 1, name: "Surf lessons" })).toBeVisible();
  const surfUrl = page.url();
  {
    const ctx = await browser.newContext();
    const benPage = await ctx.newPage();
    await benPage.goto("/login");
    await login(benPage, ben.email, ben.password);
    await expect(benPage).toHaveURL(/\/home$/);
    await benPage.goto(surfUrl);
    await benPage.getByRole("textbox", { name: "Add a comment" }).fill("Does this include the wetsuit hire? Chloe said it might be extra.");
    await benPage.getByRole("button", { name: "Post comment" }).click();
    await expect(benPage.getByText("Posting…")).toHaveCount(0);
    await ctx.close();
  }
  await page.reload();
  await page.getByRole("textbox", { name: "Add a comment" }).fill("It does, boards and wetsuits for all three mornings.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Posting…")).toHaveCount(0);

  // An empty group.
  const emptyGroupUrl = await createGroup(page, "Book club");

  // --- Signed in -------------------------------------------------------------------------
  await nav(page).getByRole("link", { name: "Home" }).click();
  await expect(page.getByRole("region", { name: "Your balance" })).toBeVisible();
  await shot("home");

  await nav(page).getByRole("link", { name: "Groups" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible();
  await shot("groups");

  await page.goto(groupUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon trip" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recurring" })).toContainText("Co-working desk");
  await expect(settlePanel(page).getByTestId("remind-button").first()).toBeVisible();
  await shot("group-detail");

  // Add expense, repeating weekly: the sheet says when it repeats.
  await shellAddExpense(page).click();
  sheet = expenseSheet(page);
  await fillExpense(sheet, { amount: "120", description: "Surf board rental" });
  await sheet.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Weekly" }).click();
  await expect(sheet.getByText(/^Repeats every /)).toBeVisible();
  await sheet.getByText(/^Repeats every /).scrollIntoViewIfNeeded();
  await shot("add-expense-repeat-weekly", { fullPage: false });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Add expense in Exact mode, partly assigned.
  await shellAddExpense(page).click();
  sheet = expenseSheet(page);
  await fillExpense(sheet, { amount: "64.80", description: "Pastéis and coffee", mode: "Exact", values: { You: "20", Ben: "16.20", Chloe: "12" } });
  await expect(sheet.getByText("left to assign")).toBeVisible();
  await expect(splitInput(sheet, "Exact", "Dev")).toBeVisible();
  await shot("add-expense-exact", { fullPage: false });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Settle up, prefilled from the first plan step.
  await settlePanel(page).getByRole("button", { name: /^Record payment:/ }).first().click();
  await expect(dialog(page, "Settle up")).toBeVisible();
  await shot("settle-up", { fullPage: false });
  await page.keyboard.press("Escape");

  // Paying Ben, who has saved handles: "Pay Ben €42.00 with PayPal".
  await settlePanel(page).getByRole("button", { name: "Record a different payment" }).click();
  sheet = dialog(page, "Settle up");
  await sheet.getByLabel("From", { exact: true }).selectOption({ label: "You" });
  await sheet.getByLabel("To", { exact: true }).selectOption({ label: "Ben" });
  await sheet.getByLabel("Amount", { exact: true }).fill("42");
  await expect(sheet.getByRole("link", { name: /with PayPal/ })).toBeVisible();
  await shot("settle-up-payment-links", { fullPage: false });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // The group's invite link.
  await page.getByRole("button", { name: "Invite with a link" }).first().click();
  sheet = dialog(page, "Invite with a link");
  await expect(sheet.getByLabel("Invite link")).toHaveValue(/\/join\//);
  const joinPath = new URL(await sheet.getByLabel("Invite link").inputValue()).pathname;
  await shot("invite-link-sheet", { fullPage: false });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await expenseLink(page, "Surf lessons").click();
  await expect(page.getByRole("heading", { level: 1, name: "Surf lessons" })).toBeVisible();
  await shot("expense-detail");

  await page.goto(groupUrl);
  await expenseLink(page, "Co-working desk").click();
  await expect(page.getByRole("heading", { level: 1, name: "Co-working desk" })).toBeVisible();
  await expect(page.getByText("Repeats", { exact: true })).toBeVisible();
  await shot("expense-detail-recurring");

  await page.goto("/friends");
  await shot("friends");

  await page.goto(friendUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Maya" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Recurring" })).toContainText("Music streaming");
  // filter(visible): while the page streams, a hidden copy of the streamed chunk can briefly exist.
  await expect(page.getByTestId("remind-button").filter({ visible: true })).toBeVisible();
  await shot("friend-detail");

  await page.goto("/activity");
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await shot("activity");

  // Search and filters on Activity.
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  sheet = dialog(page, "Filters");
  await sheet.getByLabel("Category").selectOption({ label: "Entertainment" });
  await sheet.getByRole("radio", { name: "You" }).click();
  await shot("activity-filters", { fullPage: false });
  await sheet.getByRole("button", { name: "Show results" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("searchbox", { name: "Search expenses" }).fill("ti");
  await expect(page.getByRole("region", { name: "Search results" }).getByRole("status")).toHaveText(/^\d+ expenses?$/);
  await shot("activity-search-results");

  // Spending insights.
  await page.goto("/insights");
  await expect(page.getByRole("heading", { level: 1, name: "Your spending" })).toBeVisible();
  await shot("insights");
  await page.goto("/insights?months=12");
  await expect(page.getByRole("radiogroup", { name: "Your share by month" }).getByRole("radio")).toHaveCount(12);
  await shot("insights-12-months");
  await page.goto(`${new URL(groupUrl).pathname}/insights`);
  await expect(page.getByRole("heading", { level: 1, name: "Group spending" })).toBeVisible();
  await shot("group-insights");

  // Comments on an expense.
  await page.goto(surfUrl);
  await expect(page.getByRole("region", { name: "Comments" })).toContainText("wetsuit hire");
  await page.getByRole("heading", { level: 2, name: "Comments" }).scrollIntoViewIfNeeded();
  await shot("expense-comments", { fullPage: false });

  // Group settings: the emoji picker.
  await page.goto(groupUrl);
  await page.getByRole("button", { name: "Group settings" }).click();
  sheet = dialog(page, "Group settings");
  await sheet.getByRole("group", { name: "Emoji" }).scrollIntoViewIfNeeded();
  await shot("group-settings-emoji", { fullPage: false });
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await shot("account");
  await page.goto("/account#notifications");
  await expect(page.getByRole("switch", { name: "Weekly summary (Mondays)" })).toBeVisible();
  await page.getByRole("switch", { name: "Weekly summary (Mondays)" }).scrollIntoViewIfNeeded();
  await shot("account-notifications", { fullPage: false });

  await page.goto(emptyGroupUrl);
  await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
  await shot("empty-group");

  // Adding someone with no account: the sheet asks for their name, then invites them.
  const priyaEmail = makeUser(info, "Priya").email;
  await page.getByRole("button", { name: "Add member" }).first().click();
  sheet = dialog(page, "Add member");
  await sheet.getByLabel("Email").fill(priyaEmail);
  await sheet.getByRole("button", { name: "Add member" }).click();
  await expect(sheet.getByLabel("Their name")).toBeFocused();
  await sheet.getByLabel("Their name").fill("Priya");
  await shot("add-member-name", { fullPage: false });
  await sheet.getByRole("button", { name: "Invite Priya" }).click();
  await expectToast(page, "Priya invited");
  await expect(page.getByText("You and Priya (invited)")).toBeVisible();
  await shot("group-with-invited");

  // Archive the (settled) book club: read-only page, and the groups list's Archived section.
  await page.getByRole("button", { name: "Group settings" }).click();
  sheet = dialog(page, "Group settings");
  await sheet.getByRole("button", { name: "Archive group" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Archive group" }).click();
  await expectToast(page, "Group archived");
  await expect(page.getByRole("region", { name: "Archived group" })).toBeVisible();
  await shot("archived-group");
  await page.goto("/groups");
  await page.getByText("Archived (1)").click();
  await expect(page.getByRole("list", { name: "Archived groups" })).toContainText("Book club");
  await shot("groups-archived");

  // Offline: the indicator, a queued expense, and the offline page.
  await page.goto(groupUrl);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(async () => Boolean(navigator.serviceWorker.controller && (await caches.match("/offline")))), { timeout: 15_000 }).toBe(true);
  await page.context().setOffline(true);
  await expect(page.getByTestId("offline-indicator")).toContainText("You're offline.");
  await shot("offline-indicator", { fullPage: false });
  await shellAddExpense(page).click();
  sheet = expenseSheet(page);
  await fillExpense(sheet, { amount: "14.50", description: "Ginjinha round" });
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByTestId("offline-indicator")).toContainText("1 expense waiting to sync");
  await shot("offline-waiting", { fullPage: false });
  await page.goto("/friends");
  await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
  await page.screenshot({ path: `${dir}/${String(++n).padStart(2, "0")}-offline-page.png`, animations: "disabled", style: SHOT_STYLE });
  await page.context().setOffline(false);
  await expect(page.getByRole("heading", { level: 1, name: "Friends" })).toBeVisible({ timeout: 15_000 });
  await expectToast(page, "Added 'Ginjinha round'");

  // --- Signed out: join link and claim page ------------------------------------------------
  {
    const ctx = await browser.newContext();
    const visitor = await ctx.newPage();
    await visitor.goto(joinPath);
    await expect(visitor.getByRole("heading", { level: 1, name: "Join Lisbon trip" })).toBeVisible();
    await shot("join-signed-out", { target: visitor });
    await visitor.goto(await linkFor(priyaEmail, "/invite/accept"));
    await expect(visitor.getByRole("heading", { level: 1, name: "Join BillSplit" })).toBeVisible();
    await shot("claim-account", { target: visitor });

    // Unsubscribe from an email's footer link: asks first, then confirms; a broken link explains itself.
    // Everyday updates are push only, so the email is a reminder (Maya has no push device: it falls back to email).
    await page.goto(friendUrl);
    await page.getByRole("button", { name: "Remind Maya", exact: true }).first().click();
    await expectToast(page, "Reminder sent to Maya");
    const unsub = unsubscribeLink(await waitForMail(maya.email, /^Reminder from Ana Lima/));
    await visitor.goto(unsub);
    await expect(visitor.getByRole("heading", { level: 1, name: "Stop reminders?" })).toBeVisible();
    await shot("unsubscribe", { target: visitor });
    await visitor.getByRole("button", { name: "Stop reminders" }).click();
    await expect(visitor.getByRole("heading", { level: 1, name: "Unsubscribed" })).toBeVisible();
    await shot("unsubscribed", { target: visitor });
    await visitor.goto(unsub.replace(/s=[^&]+/, "s=not-a-real-signature"));
    await expect(visitor.getByRole("heading", { level: 1, name: "This unsubscribe link doesn't work" })).toBeVisible();
    await shot("unsubscribe-invalid", { target: visitor });
    await ctx.close();
  }

  // --- Dark mode -------------------------------------------------------------------------
  await page.evaluate(() => localStorage.setItem("bs-theme", "dark"));
  await page.goto("/home");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await shot("home-dark");
  await page.goto(groupUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon trip" })).toBeVisible();
  await shot("group-detail-dark");
  await page.goto("/insights");
  await expect(page.getByRole("heading", { level: 1, name: "Your spending" })).toBeVisible();
  await shot("insights-dark");
  await page.goto(`${new URL(groupUrl).pathname}/insights`);
  await expect(page.getByRole("heading", { level: 1, name: "Group spending" })).toBeVisible();
  await shot("group-insights-dark");
  await page.goto("/activity?q=ti&category=entertainment");
  await expect(page.getByRole("region", { name: "Search results" }).getByRole("status")).toHaveText(/^\d+ expenses?$/);
  await shot("activity-search-dark");
  await page.evaluate(() => localStorage.removeItem("bs-theme"));
});
