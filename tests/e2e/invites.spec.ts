import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addExpense, createGroup, dialog, expectBeam, expectToast, groupBeamRow, login, makeUser, register, rx } from "./helpers";
import { linkFor, mailsTo } from "./mail";

async function fillRegister(page: Page, user: { name: string; email: string; password: string }) {
  await page.getByLabel("Name", { exact: true }).fill(user.name);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill(user.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

test.describe("invite by email", () => {
  test("an invited placeholder shares expenses, then claims the account and inherits the balance", async ({ page, browser }, info) => {
    const ana = makeUser(info, "Ana");
    const ben = makeUser(info, "Ben");
    await register(page, ana);
    const groupUrl = await createGroup(page, "Lisbon trip", "USD");

    // Ben has no account: the sheet asks for his name, then invites him.
    await page.getByRole("button", { name: "Add member" }).first().click();
    const sheet = dialog(page, "Add member");
    await sheet.getByLabel("Email").fill(ben.email);
    await sheet.getByRole("button", { name: "Add member" }).click();
    await expect(sheet.getByLabel("Their name")).toBeFocused();
    await sheet.getByLabel("Their name").fill("Ben");
    await sheet.getByRole("button", { name: "Invite Ben" }).click();
    await expectToast(page, "Ben invited");
    await expect(sheet).toBeHidden();
    await expect(page.getByText("You and Ben (invited)")).toBeVisible();
    await expect(groupBeamRow(page, "Ben (invited)")).toBeVisible();

    // The placeholder can pay for things straight away.
    await addExpense(page, { amount: "60", description: "Fado tickets", paidBy: "Ben (invited)" });
    await expectBeam(page, "Ben (invited)", "gets back $30.00");
    await expectBeam(page, "You", "owe $30.00");

    // The invite email is in the outbox.
    const firstLink = await linkFor(ben.email, "/invite/accept");
    expect(mailsTo(ben.email)[0].subject).toBe("You're invited to split expenses on BillSplit");
    expect(mailsTo(ben.email)[0].text).toContain("added you to Lisbon trip");

    // Ben tries to sign up normally: he's pointed at his invite, and can ask for it again.
    const benContext = await browser.newContext();
    const benPage = await benContext.newPage();
    await benPage.goto("/register");
    await fillRegister(benPage, ben);
    await expect(benPage.getByText("You've been invited with this email. Check your inbox for the invite link.")).toBeVisible();
    const sentBefore = mailsTo(ben.email).length;
    await benPage.getByRole("button", { name: "Email me the invite again" }).click();
    await expect(benPage.getByRole("status").filter({ hasText: `We've sent a new invite link to ${ben.email}` })).toBeVisible();
    const link = await linkFor(ben.email, "/invite/accept", { after: sentBefore });
    expect(link).not.toBe(firstLink);
    // Editing the email hides the resend button again.
    await benPage.getByLabel("Email", { exact: true }).fill(`x${ben.email}`);
    await expect(benPage.getByRole("button", { name: "Email me the invite again" })).toHaveCount(0);

    // The claim page: name prefilled, email fixed, choose a password.
    await benPage.goto(link);
    await expect(benPage.getByRole("heading", { level: 1, name: "Join BillSplit" })).toBeVisible();
    await expect(benPage.getByLabel("Name", { exact: true })).toHaveValue("Ben");
    await expect(benPage.getByLabel("Email", { exact: true })).toHaveValue(ben.email);
    await benPage.getByLabel("Name", { exact: true }).fill("Ben Silva");
    await benPage.getByLabel("Password", { exact: true }).fill(ben.password);
    await benPage.getByRole("button", { name: "Set up my account" }).click();
    await expect(benPage).toHaveURL(/\/home$/);
    await expect(benPage.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
    // Claiming proved the email, so there's nothing to confirm.
    await expect(benPage.getByTestId("verify-banner")).toHaveCount(0);

    // He inherited the placeholder's history and balance.
    await benPage.goto(groupUrl);
    await expect(benPage.getByRole("heading", { level: 1, name: "Lisbon trip" })).toBeVisible();
    await expectBeam(benPage, "You", "get back $30.00");
    await expect(benPage.getByRole("link").filter({ hasText: "Fado tickets" })).toBeVisible();

    // Both invite links are now spent.
    for (const used of [link, firstLink]) {
      await benPage.goto(used);
      await expect(benPage.getByRole("heading", { level: 1, name: "This invite link no longer works" })).toBeVisible();
    }
    await benContext.close();

    // Ana now sees Ben as a regular member, under the name he chose.
    await page.reload();
    await expectBeam(page, "Ben Silva", "gets back $30.00");
    await expect(page.getByText("(invited)")).toHaveCount(0);

    // And he can log in normally.
    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto("/login");
    await login(freshPage, ben.email, ben.password);
    await expect(freshPage).toHaveURL(/\/home$/);
    await fresh.close();
  });

  test("adding an unknown friend by email invites them", async ({ page }, info) => {
    const ana = makeUser(info, "Ana");
    const maya = makeUser(info, "Maya");
    await register(page, ana);
    await page.goto("/friends");
    await page.getByRole("button", { name: "Add friend" }).first().click();
    const sheet = dialog(page, "Add friend");
    await sheet.getByLabel("Email").fill(maya.email);
    await sheet.getByRole("button", { name: "Add friend" }).click();
    await expect(sheet.getByLabel("Their name")).toBeFocused();
    await sheet.getByLabel("Their name").fill("Maya");
    await sheet.getByRole("button", { name: "Invite Maya" }).click();
    await expectToast(page, "Maya invited");
    await expect(sheet).toBeHidden();
    const row = page.getByRole("link").filter({ hasText: "Maya (invited)" });
    await expect(row).toContainText(`Invite sent to ${maya.email}`);
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Maya (invited)" })).toBeVisible();
    await expect(page.getByText("Maya hasn't joined yet — expenses you add still count.")).toBeVisible();
    await linkFor(maya.email, "/invite/accept");
  });
});

test.describe("invite links", () => {
  test("share a join link; visitors log in or sign up, join, and a reset retires the old link", async ({ page, browser }, info) => {
    const ana = makeUser(info, "Ana");
    const chloe = makeUser(info, "Chloe");
    const dev = makeUser(info, "Dev");
    // Chloe already has an account; Dev doesn't.
    const setup = await browser.newContext();
    await register(await setup.newPage(), chloe);
    await setup.close();

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await register(page, ana);
    const groupUrl = await createGroup(page, "Lisbon trip");

    await page.getByRole("button", { name: "Invite with a link" }).first().click();
    const sheet = dialog(page, "Invite with a link");
    await expect(sheet).toContainText("Anyone with this link can join Lisbon trip");
    const input = sheet.getByLabel("Invite link");
    await expect(input).toHaveValue(/\/join\/[\w.-]+$/);
    const link = await input.inputValue();
    await sheet.getByRole("button", { name: "Copy link" }).click();
    await expectToast(page, "Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    const path = new URL(link).pathname;

    // Chloe, signed out, opens the link: a preview of the group, then log in to join.
    const chloeContext = await browser.newContext();
    const chloePage = await chloeContext.newPage();
    await chloePage.goto(path);
    await expect(chloePage.getByRole("heading", { level: 1, name: "Join Lisbon trip" })).toBeVisible();
    await expect(chloePage.getByText("1 member")).toBeVisible();
    await expect(chloePage.getByText(rx("Ana"))).toBeVisible();
    await expect(chloePage.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await chloePage.getByRole("link", { name: "Log in to join" }).click();
    await expect(chloePage).toHaveURL(/\/login\?next=/);
    await login(chloePage, chloe.email, chloe.password);
    await expect(chloePage).toHaveURL(new RegExp(`${path}$`));
    await expect(chloePage.getByText(`Joining as ${chloe.name} (${chloe.email}).`)).toBeVisible();
    await chloePage.getByRole("button", { name: "Join group" }).click();
    await expectToast(chloePage, "You joined Lisbon trip");
    await expect(chloePage).toHaveURL(new RegExp(`${new URL(groupUrl).pathname}$`));
    await expect(chloePage.getByRole("heading", { level: 1, name: "Lisbon trip" })).toBeVisible();
    // Opening the link again just says so.
    await chloePage.goto(path);
    await expect(chloePage.getByRole("heading", { level: 1, name: "You're already in Lisbon trip" })).toBeVisible();
    await chloeContext.close();

    // Dev, new to BillSplit, signs up from the link and lands back on it.
    const devContext = await browser.newContext();
    const devPage = await devContext.newPage();
    await devPage.goto(path);
    await devPage.getByRole("link", { name: "Create an account to join" }).click();
    await expect(devPage).toHaveURL(/\/register\?next=/);
    await fillRegister(devPage, dev);
    await expect(devPage).toHaveURL(new RegExp(`${path}$`));
    await devPage.getByRole("button", { name: "Join group" }).click();
    await expectToast(devPage, "You joined Lisbon trip");
    await expect(devPage.getByRole("heading", { level: 1, name: "Lisbon trip" })).toBeVisible();
    await expect(devPage.getByText("3 members")).toBeVisible();

    // Ana (an admin) resets the link: the old one stops working, members stay.
    await page.reload();
    await expect(page.getByText("3 members")).toBeVisible();
    await page.getByRole("button", { name: "Invite with a link" }).first().click();
    await expect(sheet.getByLabel("Invite link")).toHaveValue(link);
    await sheet.getByRole("button", { name: "Reset link" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Reset the invite link?" });
    await confirm.getByRole("button", { name: "Reset link" }).click();
    await expectToast(page, "Link reset");
    await expect(sheet.getByLabel("Invite link")).not.toHaveValue(link);
    await expect(sheet.getByLabel("Invite link")).toHaveValue(/\/join\/[\w.-]+$/);
    const newLink = await sheet.getByLabel("Invite link").inputValue();

    await devPage.goto(path);
    await expect(devPage.getByRole("heading", { level: 1, name: "This invite link doesn't work" })).toBeVisible();
    await expect(devPage.getByRole("link", { name: "Go to BillSplit" })).toBeVisible();
    await devPage.goto(new URL(newLink).pathname);
    await expect(devPage.getByRole("heading", { level: 1, name: "You're already in Lisbon trip" })).toBeVisible();
    await devContext.close();
  });
});
