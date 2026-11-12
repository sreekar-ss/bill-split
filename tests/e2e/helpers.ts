import { expect, type Browser, type Locator, type Page, type TestInfo } from "@playwright/test";

export const PASSWORD = "correct-horse-42";

export interface TestUser {
  name: string;
  email: string;
  password: string;
}

let counter = 0;

/** A suffix unique to this test, project and call, so every run makes fresh accounts. */
export function uniq(info: TestInfo): string {
  counter += 1;
  const id = `${info.testId}-${info.project.name}-${info.repeatEachIndex}-${info.retry}`.replace(/[^a-z0-9]/gi, "").slice(-14);
  return `${id}${counter}${Math.random().toString(36).slice(2, 6)}`.toLowerCase();
}

export function makeUser(info: TestInfo, name: string): TestUser {
  return { name, email: `${name.toLowerCase().replace(/\W+/g, "")}.${uniq(info)}@example.test`, password: PASSWORD };
}

/** Escape a string for use inside a RegExp. */
export function rx(text: string): RegExp {
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

// --- Auth -----------------------------------------------------------------------------------

export async function register(page: Page, user: TestUser) {
  await page.goto("/register");
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/home$/);
}

export async function login(page: Page, email: string, password: string) {
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

export async function logout(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Registers a user in a separate browser context (so the current page stays signed in). */
export async function registerElsewhere(browser: Browser, user: TestUser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await register(page, user);
  await context.close();
  return user;
}

/** Registers `main` on `page` plus `others` in throwaway contexts. */
export async function setupUsers(page: Page, browser: Browser, info: TestInfo, mainName: string, ...otherNames: string[]) {
  const others: TestUser[] = [];
  for (const n of otherNames) others.push(await registerElsewhere(browser, makeUser(info, n)));
  const me = makeUser(info, mainName);
  await register(page, me);
  return { me, others };
}

// --- Shell ----------------------------------------------------------------------------------

/** The visible "Add expense" control in the shell (rail on desktop, pill on mobile). */
export function shellAddExpense(page: Page): Locator {
  return page.getByRole("button", { name: "Add expense", exact: true }).filter({ visible: true }).first();
}

/** The visible main navigation (rail or bottom tabs). */
export function nav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
}

export async function expectToast(page: Page, text: string) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

export function dialog(page: Page, name?: string | RegExp): Locator {
  return name ? page.getByRole("dialog", { name }) : page.getByRole("dialog");
}

// --- Groups ---------------------------------------------------------------------------------

export async function createGroup(page: Page, name: string, currency?: string): Promise<string> {
  await page.goto("/groups");
  await page.getByRole("button", { name: "New group" }).first().click();
  const sheet = dialog(page, "New group");
  await sheet.getByLabel("Group name").fill(name);
  if (currency) await sheet.getByLabel("Currency").selectOption(currency);
  await sheet.getByRole("button", { name: "Create group" }).click();
  await expectToast(page, "Group created");
  await expect(page).toHaveURL(/\/groups\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url();
}

export async function addMember(page: Page, email: string) {
  await page.getByRole("button", { name: "Add member" }).first().click();
  const sheet = dialog(page, "Add member");
  await sheet.getByLabel("Email").fill(email);
  await sheet.getByRole("button", { name: "Add member" }).click();
  await expectToast(page, "Member added");
  await expect(sheet).toBeHidden();
}

export function groupBalances(page: Page): Locator {
  return page.getByRole("list", { name: "Members' balances" });
}

export function groupBeamRow(page: Page, name: string): Locator {
  return groupBalances(page)
    .getByRole("listitem")
    .filter({ has: page.locator("span.font-semibold", { hasText: new RegExp(`^\\s*${name}\\s*$`) }) });
}

export function settlePanel(page: Page): Locator {
  return page.getByRole("complementary", { name: "Balances and settle up" });
}

// --- Expenses -------------------------------------------------------------------------------

export type SplitMode = "Equally" | "Exact" | "Percent" | "Shares";

export interface ExpenseSpec {
  amount: string;
  description: string;
  /** Visible option label in "Paid by" ("You", "Ben"). */
  paidBy?: string;
  /** Option label in "Split with" (group or friend name). Only needed when not preset. */
  splitWith?: string;
  mode?: SplitMode;
  /** For Exact/Percent/Shares: values by person label ("You", "Ben"). */
  values?: Record<string, string>;
  /** Equal split: people to untick. */
  exclude?: string[];
  category?: string;
  date?: string;
}

export function expenseSheet(page: Page): Locator {
  return dialog(page, /^(Add|Edit) expense$/);
}

/** Aria label prefix of a split row input for a person label. */
function possessive(person: string) {
  return person === "You" ? "Your" : `${person}'s`;
}

export function splitInput(sheet: Locator, mode: Exclude<SplitMode, "Equally">, person: string): Locator {
  const p = possessive(person);
  const label = mode === "Exact" ? new RegExp(`^${p} share in`) : mode === "Percent" ? `${p} percentage` : `${p} shares`;
  return sheet.getByLabel(label);
}

export async function fillExpense(sheet: Locator, spec: ExpenseSpec) {
  if (spec.splitWith) await sheet.getByLabel("Split with").selectOption({ label: spec.splitWith });
  await sheet.getByLabel(/^Amount/).fill(spec.amount);
  await sheet.getByLabel("Description").fill(spec.description);
  if (spec.paidBy) await sheet.getByLabel("Paid by").selectOption({ label: spec.paidBy });
  if (spec.date) await sheet.getByLabel("Date").fill(spec.date);
  if (spec.category) await sheet.getByLabel("Category").selectOption({ label: spec.category });
  const mode = spec.mode ?? "Equally";
  await sheet.getByRole("radiogroup", { name: "Split method" }).getByRole("radio", { name: mode }).click();
  for (const person of spec.exclude ?? []) {
    await sheet.getByRole("checkbox", { name: `Include ${person === "You" ? "you" : person}` }).click();
  }
  if (mode !== "Equally") {
    for (const [person, value] of Object.entries(spec.values ?? {})) {
      await splitInput(sheet, mode, person).fill(value);
    }
  }
}

/** Opens the add-expense sheet from the shell, fills it and saves. */
export async function addExpense(page: Page, spec: ExpenseSpec) {
  await shellAddExpense(page).click();
  const sheet = expenseSheet(page);
  await expect(sheet).toBeVisible();
  await fillExpense(sheet, spec);
  await sheet.getByRole("button", { name: "Save expense" }).click();
  await expectToast(page, "Expense saved");
  await expect(sheet).toBeHidden();
}

/** A ledger link (expense row) in the current page by description. */
export function expenseLink(page: Page, description: string): Locator {
  return page.getByRole("link").filter({ hasText: description }).first();
}

/**
 * Registers `mainName` on `page` and the others in their own contexts, creates a group and adds
 * everyone to it by email. Leaves `page` on the group.
 */
export async function setupGroup(page: Page, browser: Browser, info: TestInfo, groupName: string, mainName: string, ...otherNames: string[]) {
  const { me, others } = await setupUsers(page, browser, info, mainName, ...otherNames);
  const url = await createGroup(page, groupName);
  for (const o of others) await addMember(page, o.email);
  return { me, others, url };
}

/** Asserts a member's beam words on the group page, e.g. ("Ben", "gets back $60.00"). */
export async function expectBeam(page: Page, name: string, words: string) {
  await expect(groupBeamRow(page, name)).toContainText(words);
}

export async function expectNotFound(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "We couldn't find that" })).toBeVisible();
  await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
}

/**
 * Starts watching the DOM for the in-app not-found page. Returns a function that resolves to
 * true if it was ever rendered (e.g. a 404 flashing after deleting the thing on screen).
 */
export async function watchForNotFound(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const w = window as unknown as { __sawNotFound?: boolean };
    w.__sawNotFound = false;
    const check = () => {
      if (document.body.innerText.includes("We couldn't find that")) w.__sawNotFound = true;
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => Boolean((window as unknown as { __sawNotFound?: boolean }).__sawNotFound));
}
