import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { MAIL_OUTBOX } from "../../playwright.config";
import { login, logout, makeUser, register } from "./helpers";

/** Waits for the newest reset email to `to` and returns the link's path + query. */
async function resetLinkFor(to: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      () => {
        const mails = readFileSync(MAIL_OUTBOX, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { to: string; text: string });
        const mail = mails.reverse().find((m) => m.to === to);
        link = mail?.text.match(/https?:\/\/[^\s]+\/reset-password\?token=[\w%-]+/)?.[0];
        return link;
      },
      { timeout: 10_000 },
    )
    .toBeTruthy();
  const url = new URL(link!);
  return url.pathname + url.search;
}

test("forgot password: email link sets a new password, signs in, and signs out other devices", async ({ page, browser }, info) => {
  const user = makeUser(info, "Rae");
  await register(page, user);

  // A second device that is signed in before the reset.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto("/login");
  await login(otherPage, user.email, user.password);
  await expect(otherPage).toHaveURL(/\/home$/);

  await logout(page);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?email=/);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  const link = await resetLinkFor(user.email);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();

  const newPassword = "brand-new-pass-77";
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill("something-else-1");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("The two passwords don't match.")).toBeVisible();

  await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByText("Password changed. You're logged in.")).toBeVisible();

  // The other device was signed out.
  await otherPage.goto("/home");
  await expect(otherPage).toHaveURL(/\/login/);
  await other.close();

  // The link is single-use.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Send a new link" })).toHaveAttribute("href", "/forgot-password");

  // Old password no longer works; the new one does.
  await logout(page);
  await login(page, user.email, user.password);
  await expect(page.getByText("That email and password don't match an account.")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
});

test("forgot password gives the same answer for unknown emails, and bad links explain themselves", async ({ page }, info) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(`nobody.${info.testId.slice(-6)}@example.test`);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto("/reset-password?token=not-a-real-token-but-long-enough-0123456789");
  await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
  await page.goto("/reset-password");
  await expect(page.getByRole("heading", { name: "This link no longer works" })).toBeVisible();
});
