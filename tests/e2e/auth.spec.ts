import { expect, test } from "./fixtures";
import { login, logout, makeUser, register } from "./helpers";

test.describe("auth", () => {
  test("register lands on the first-run home, then log out and back in", async ({ page }, info) => {
    const user = makeUser(info, "Ana");
    await page.goto("/");
    await page.getByRole("link", { name: "Create an account" }).first().click();
    await expect(page).toHaveURL(/\/register/);
    await register(page, user);

    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    const welcome = page.getByRole("region", { name: "Get started" });
    await expect(welcome.getByRole("heading", { name: "Welcome, Ana" })).toBeVisible();
    await expect(welcome.getByRole("link", { name: "Create a group" })).toBeVisible();
    await expect(welcome.getByRole("link", { name: "Add a friend" })).toBeVisible();

    await logout(page);
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login\?next=%2Fhome/);

    await page.goto("/login");
    await login(page, user.email, user.password);
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { name: "Welcome, Ana" })).toBeVisible();
  });

  test("wrong password shows an error and keeps what was typed", async ({ page }, info) => {
    const user = makeUser(info, "Ben");
    await register(page, user);
    await logout(page);

    await login(page, user.email, "not-the-password");
    await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(user.email);

    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL(/\/home$/);
  });

  test("registering an email twice explains the conflict", async ({ page, browser }, info) => {
    const user = makeUser(info, "Dup");
    await register(page, user);
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto("/register");
    await p2.getByLabel("Name", { exact: true }).fill("Someone");
    await p2.getByLabel("Email", { exact: true }).fill(user.email);
    await p2.getByLabel("Password", { exact: true }).fill(user.password);
    await p2.getByRole("button", { name: "Create account" }).click();
    await expect(p2.getByText(/already/i).first()).toBeVisible();
    await expect(p2).toHaveURL(/\/register/);
    await other.close();
  });

  test("a protected route redirects to login and returns after it", async ({ page }, info) => {
    const user = makeUser(info, "Chloe");
    await register(page, user);
    await logout(page);

    await page.goto("/activity");
    await expect(page).toHaveURL(/\/login\?next=%2Factivity/);
    await login(page, user.email, user.password);
    await expect(page).toHaveURL(/\/activity$/);
    await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  });

  test("an unsafe next parameter falls back to home", async ({ page }, info) => {
    const user = makeUser(info, "Dev");
    await register(page, user);
    await logout(page);
    await page.goto("/login?next=" + encodeURIComponent("/\\evil.example"));
    await login(page, user.email, user.password);
    await expect(page).toHaveURL(/localhost:\d+\/home$/);
  });

  test("signed-in visitors skip the landing and auth pages", async ({ page }, info) => {
    await register(page, makeUser(info, "Eve"));
    await page.goto("/");
    await expect(page).toHaveURL(/\/home$/);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/home$/);
  });
});
