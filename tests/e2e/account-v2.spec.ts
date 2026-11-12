import { expect, test } from "./fixtures";
import { addExpense, addMember, createGroup, dialog, expectBeam, expectToast, login, makeUser, register } from "./helpers";

test.describe("account: security and your data", () => {
  test("log out of all devices signs out every session", async ({ page, browser }, info) => {
    const ana = makeUser(info, "Ana");
    await register(page, ana);

    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/login");
    await login(otherPage, ana.email, ana.password);
    await expect(otherPage).toHaveURL(/\/home$/);

    await page.goto("/account");
    await page.getByRole("button", { name: "Log out of all devices" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Log out of all devices?" });
    await confirm.getByRole("button", { name: "Log out everywhere" }).click();
    await expect(page).toHaveURL(/\/login/);

    // The other device is signed out too.
    await otherPage.goto("/home");
    await expect(otherPage).toHaveURL(/\/login/);
    await other.close();

    // Logging in again works.
    await login(page, ana.email, ana.password);
    await expect(page).toHaveURL(/\/home$/);
  });

  test("download my data returns your data as JSON", async ({ page }, info) => {
    const ana = makeUser(info, "Ana");
    await register(page, ana);
    await createGroup(page, "Book club");
    await page.goto("/account");

    const link = page.getByRole("link", { name: "Download my data" });
    await expect(link).toHaveAttribute("href", "/api/account/export");
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toMatch(/^billsplit-export-\d{4}-\d{2}-\d{2}\.json$/);

    const res = await page.request.get("/api/account/export");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    const data = await res.json();
    expect(data.profile.email).toBe(ana.email);
    expect(data.profile.name).toBe("Ana");
    expect(data.groups.map((g: { name: string }) => g.name)).toContain("Book club");
    // Not for anyone signed out.
    const anon = await page.context().browser()!.newContext();
    expect((await anon.request.get(new URL("/api/account/export", page.url()).toString())).status()).toBe(401);
    await anon.close();
  });

  test("delete account is blocked by an open balance, then works once settled", async ({ page, browser }, info) => {
    const ana = makeUser(info, "Ana");
    const ben = makeUser(info, "Ben");
    const benContext = await browser.newContext();
    const benPage = await benContext.newPage();
    await register(benPage, ben);

    await register(page, ana);
    const groupUrl = await createGroup(page, "Ski trip", "USD");
    await addMember(page, ben.email);
    await addExpense(page, { amount: "40", description: "Lift passes", paidBy: "Ben" });
    await expectBeam(page, "You", "owe $20.00");

    // Blocked: wrong password first, then the open balance.
    await page.goto("/account");
    await page.getByRole("button", { name: "Delete account" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete your account?" });
    await expect(confirm.getByLabel("Password", { exact: true })).toBeFocused();
    await confirm.getByLabel("Password", { exact: true }).fill("not-my-password");
    await confirm.getByRole("button", { name: "Delete account" }).click();
    await expect(confirm.getByText("That password isn't right.")).toBeVisible();
    await confirm.getByLabel("Password", { exact: true }).fill(ana.password);
    await confirm.getByRole("button", { name: "Delete account" }).click();
    await expect(confirm.getByText("Settle up first: you still have open balances with 1 person.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(confirm).toBeHidden();

    // Settle up, then delete.
    await page.goto(groupUrl);
    await page.getByRole("button", { name: /^Record payment: You pay Ben/ }).click();
    const sheet = dialog(page, "Settle up");
    await sheet.getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");
    await expect(page.getByText("Everyone is settled up.")).toBeVisible();

    await page.goto("/account");
    await page.getByRole("button", { name: "Delete account" }).click();
    await confirm.getByLabel("Password", { exact: true }).fill(ana.password);
    await confirm.getByRole("button", { name: "Delete account" }).click();
    await expect(page).toHaveURL(/\/\?deleted=1$/);
    await expect(page.getByRole("status").filter({ hasText: "Your account was deleted." })).toBeVisible();

    // Signed out, and the credentials no longer work.
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
    await login(page, ana.email, ana.password);
    await expect(page.getByText("That email and password don't match an account.")).toBeVisible();

    // Ben's history still adds up, with Ana shown as "Deleted user".
    await benPage.goto(groupUrl);
    await expect(benPage.getByRole("heading", { level: 1, name: "Ski trip" })).toBeVisible();
    await expect(benPage.getByRole("link").filter({ hasText: "Lift passes" })).toBeVisible();
    await expect(benPage.getByText("Deleted user").first()).toBeVisible();
    await expect(benPage.getByText("Ana", { exact: true })).toHaveCount(0);
    await benContext.close();
  });
});
