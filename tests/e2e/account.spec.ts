import { expect, test } from "./fixtures";
import { createGroup, expectToast, login, logout, makeUser, register } from "./helpers";

test.describe("account", () => {
  test("update name and default currency", async ({ page }, info) => {
    const user = makeUser(info, "Ana");
    await register(page, user);
    await page.goto("/account");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(user.email);

    const save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();
    await page.getByLabel("Name", { exact: true }).fill("Ana Lima");
    await page.getByLabel("Default currency").selectOption("EUR");
    await save.click();
    await expectToast(page, "Changes saved");

    await page.reload();
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Ana Lima");
    await expect(page.getByLabel("Default currency")).toHaveValue("EUR");

    // New groups start in the default currency.
    await page.goto("/groups");
    await page.getByRole("button", { name: "New group" }).first().click();
    await expect(page.getByRole("dialog", { name: "New group" }).getByLabel("Currency")).toHaveValue("EUR");
    await page.keyboard.press("Escape");

    // An empty name is rejected.
    await page.goto("/account");
    await page.getByLabel("Name", { exact: true }).fill(" ");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByLabel("Name", { exact: true })).toHaveAttribute("aria-invalid", "true");
  });

  test("change password, then log in with the new one", async ({ page }, info) => {
    const user = makeUser(info, "Ben");
    await register(page, user);
    await page.goto("/account");

    await page.getByLabel("Current password").fill("wrong-password-1");
    await page.getByLabel("New password").fill("brand-new-pass-9");
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("That isn't your current password.")).toBeVisible();

    await page.getByLabel("Current password").fill(user.password);
    await page.getByLabel("New password").fill("brand-new-pass-9");
    await page.getByRole("button", { name: "Change password" }).click();
    await expectToast(page, "Password changed");
    await expect(page.getByLabel("Current password")).toHaveValue("");

    // Still signed in on this device.
    await page.goto("/home");
    await expect(page).toHaveURL(/\/home$/);

    await logout(page);
    await login(page, user.email, user.password);
    await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
    await login(page, user.email, "brand-new-pass-9");
    await expect(page).toHaveURL(/\/home$/);
  });

  test("changing the password logs out other devices", async ({ page, browser }, info) => {
    const user = makeUser(info, "Cleo");
    await register(page, user);
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto("/login");
    await login(otherPage, user.email, user.password);
    await expect(otherPage).toHaveURL(/\/home$/);

    await page.goto("/account");
    await page.getByLabel("Current password").fill(user.password);
    await page.getByLabel("New password").fill("another-pass-77");
    await page.getByRole("button", { name: "Change password" }).click();
    await expectToast(page, "Password changed");

    await otherPage.goto("/groups");
    await expect(otherPage).toHaveURL(/\/login/);
    await other.close();
  });

  test("theme choice persists across reloads", async ({ page }, info) => {
    await register(page, makeUser(info, "Dev"));
    await page.goto("/account");
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();

    await theme.getByRole("radio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await page.evaluate(() => localStorage.getItem("bs-theme"))).toBe("dark");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "Dark" })).toBeChecked();
    // Other pages pick it up before paint too.
    await createGroup(page, "Dark mode group");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await page.goto("/account");
    await page.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "System" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.+/);
    expect(await page.evaluate(() => localStorage.getItem("bs-theme"))).toBeNull();
  });
});
