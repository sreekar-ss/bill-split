import { expect, test } from "./fixtures";
import { expectToast, login, logout, makeUser, register } from "./helpers";
import { linkFor, mailsTo } from "./mail";

test.describe("email verification", () => {
  test("sign up shows the banner; the emailed link confirms the address and only works once", async ({ page, browser }, info) => {
    const ana = makeUser(info, "Ana");
    await register(page, ana, { verify: false });

    const banner = page.getByRole("region", { name: "Confirm your email" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(`We sent a link to ${ana.email}.`);
    // The banner sits above the page, not over it: the heading is still there.
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await linkFor(ana.email, "/verify-email");
    expect(mailsTo(ana.email)).toHaveLength(1);

    // Account says the same thing.
    await page.goto("/account");
    await expect(page.getByText("Not confirmed", { exact: true })).toBeVisible();
    // ...so the banner steps aside there instead of repeating it.
    await expect(page.getByTestId("verify-banner")).toHaveCount(0);

    // "Resend link" sends a fresh email.
    await page.goto("/home");
    await banner.getByRole("button", { name: "Resend link" }).click();
    await expectToast(page, "Link sent");
    const link = await linkFor(ana.email, "/verify-email", { after: 1 });

    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1, name: "Email confirmed" })).toBeVisible();
    await expect(page.getByText(ana.email)).toBeVisible();
    await page.getByRole("link", { name: "Go to Home" }).click();
    await expect(page).toHaveURL(/\/home$/);
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    await expect(page.getByTestId("verify-banner")).toHaveCount(0);

    await page.goto("/account");
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(page.getByText("Not confirmed", { exact: true })).toHaveCount(0);
    await expect(page.getByTestId("verify-banner")).toHaveCount(0);

    // The used link (opened somewhere you're not signed in) shows the failure state.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(link);
    await expect(otherPage.getByRole("heading", { level: 1, name: "This link no longer works" })).toBeVisible();
    await expect(otherPage.getByText(/work only once/)).toBeVisible();
    await expect(otherPage.getByRole("link", { name: "Log in" })).toBeVisible();
    // So does a made-up one.
    await otherPage.goto("/verify-email?token=not-a-real-token");
    await expect(otherPage.getByRole("heading", { level: 1, name: "This link no longer works" })).toBeVisible();
    await other.close();
  });

  test("the banner can be hidden for the rest of the session", async ({ page }, info) => {
    const ben = makeUser(info, "Ben");
    await register(page, ben, { verify: false });
    const banner = page.getByRole("region", { name: "Confirm your email" });
    await banner.getByRole("button", { name: "Hide this reminder" }).click();
    await expect(banner).toBeHidden();
    // Focus lands on the page heading, not <body>.
    await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeFocused();
    await page.goto("/groups");
    await expect(page.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible();
    await expect(page.getByTestId("verify-banner")).toHaveCount(0);
  });
});

test.describe("login protection", () => {
  test("repeated wrong passwords lock the email out with a plain message", async ({ page }, info) => {
    const cy = makeUser(info, "Cy");
    await register(page, cy);
    await logout(page);

    for (let i = 0; i < 8; i++) {
      await login(page, cy.email, `wrong-password-${i}`);
      await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
    }
    await login(page, cy.email, "wrong-password-again");
    await expect(page.getByText(/Too many failed attempts\. Try again in \d+ minutes?, or reset your password\./)).toBeVisible();
    // Even the right password waits until the lockout ends.
    await login(page, cy.email, cy.password);
    await expect(page.getByText(/^Too many failed attempts/)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
