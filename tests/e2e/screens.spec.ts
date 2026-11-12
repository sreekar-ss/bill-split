import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import {
  addExpense,
  addMember,
  createGroup,
  dialog,
  expectToast,
  expenseLink,
  expenseSheet,
  fillExpense,
  makeUser,
  nav,
  register,
  registerElsewhere,
  settlePanel,
  shellAddExpense,
  splitInput,
} from "./helpers";

/**
 * Seeds a realistic dataset through the UI and saves a screenshot of every screen to
 * reports/screens/<project>/<nn-name>.png. Opt-in: SCREENS=1 npx playwright test tests/e2e/screens.spec.ts
 */
test.skip(!process.env.SCREENS, "Screenshots only run with SCREENS=1");

// Hide transient chrome (toasts, caret) so screenshots are stable.
const SHOT_STYLE = "[data-sonner-toaster]{display:none !important} *{caret-color:transparent !important}";

test("capture every screen", async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  const dir = `reports/screens/${info.project.name}`;
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
  const me = makeUser(info, "Ana");
  me.name = "Ana Lima";
  await register(page, me);

  const groupUrl = await createGroup(page, "Lisbon trip", "EUR");
  for (const u of [ben, chloe, dev]) await addMember(page, u.email);

  await addExpense(page, { amount: "640", description: "Apartment in Alfama", category: "Travel", date: "2026-10-03" });
  await addExpense(page, { amount: "186.40", description: "Dinner at Taberna", paidBy: "Ben", category: "Food and drink", date: "2026-10-04" });
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

  // Dev pays me part of what he owes.
  await settlePanel(page).getByRole("button", { name: "Record a different payment" }).click();
  let sheet = dialog(page, "Settle up");
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
  await shot("group-detail");

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

  await expenseLink(page, "Surf lessons").click();
  await expect(page.getByRole("heading", { level: 1, name: "Surf lessons" })).toBeVisible();
  await shot("expense-detail");

  await page.goto("/friends");
  await shot("friends");

  await page.goto(friendUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Maya" })).toBeVisible();
  await shot("friend-detail");

  await page.goto("/activity");
  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await shot("activity");

  await page.goto("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await shot("account");

  await page.goto(emptyGroupUrl);
  await expect(page.getByRole("heading", { name: "No expenses yet" })).toBeVisible();
  await shot("empty-group");

  // --- Dark mode -------------------------------------------------------------------------
  await page.evaluate(() => localStorage.setItem("bs-theme", "dark"));
  await page.goto("/home");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await shot("home-dark");
  await page.goto(groupUrl);
  await expect(page.getByRole("heading", { level: 1, name: "Lisbon trip" })).toBeVisible();
  await shot("group-detail-dark");
  await page.evaluate(() => localStorage.removeItem("bs-theme"));
});
