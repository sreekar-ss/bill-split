import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addExpense, dialog, expectToast, makeUser, register, settlePanel, setupGroup, signedIn } from "./helpers";
import { mailsTo, oneClickLink, unsubscribeLink, waitForMail } from "./mail";

/** The Email notifications switch with this label on /account. */
function prefSwitch(page: Page, label: string) {
  return page.getByRole("switch", { name: label });
}

const EXPENSES = "When someone adds an expense with you";
const PAYMENTS = "When someone records a payment with you";
const REMINDERS = "Reminders when you owe someone";
const DIGEST = "Weekly summary (Mondays)";

test.describe("email notifications", () => {
  test("expense and payment emails go to the other people, never the actor, and respect the switches", async ({ page, browser }, info) => {
    const { me: ana, others } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben", "Chloe");
    const [ben, chloe] = others;
    const groupUrl = page.url();
    const anaBefore = mailsTo(ana.email).length;
    const benBefore = mailsTo(ben.email).length;
    const chloeBefore = mailsTo(chloe.email).length;

    // Ana adds an expense: Ben and Chloe each hear about it with their share.
    await addExpense(page, { amount: "90", description: "Dinner" });
    const benMail = await waitForMail(ben.email, "Ana added Dinner", { after: benBefore });
    expect(benMail.text).toContain("Ana added Dinner in Flat.");
    expect(benMail.text).toContain("Ana paid $90.00. Your share is $30.00. You owe $30.00.");
    expect(benMail.text).toMatch(/\/expenses\/[\w-]+/);
    expect(benMail.text).toContain("Unsubscribe from these emails:");
    expect(benMail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    await waitForMail(chloe.email, "Ana added Dinner", { after: chloeBefore });
    // The actor gets nothing about her own expense.
    expect(mailsTo(ana.email).slice(anaBefore)).toEqual([]);

    // Ben records his payment: Ana hears about it, Ben doesn't.
    const benPage = await signedIn(browser, ben);
    await benPage.goto(groupUrl);
    await settlePanel(benPage).getByRole("button", { name: "Record payment: You pay Ana $30.00" }).click();
    await dialog(benPage, "Settle up").getByRole("button", { name: "Record payment" }).click();
    await expectToast(benPage, "Payment recorded");
    const paid = await waitForMail(ana.email, "Ben paid you $30.00", { after: anaBefore });
    expect(paid.text).toContain("Ben paid you $30.00 in Flat.");
    expect(paid.text).toContain(groupUrl.replace(/^https?:\/\/[^/]+/, ""));
    expect(mailsTo(ben.email).slice(benBefore).map((m) => m.subject)).toEqual(["Ana added Dinner"]);

    // Ben turns expense emails off in Account; it saves straight away and survives a reload.
    await benPage.goto("/account");
    const toggle = prefSwitch(benPage, EXPENSES);
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expectToast(benPage, "Saved");
    await expect(toggle).not.toBeChecked();
    await benPage.reload();
    await expect(prefSwitch(benPage, EXPENSES)).not.toBeChecked();
    await expect(prefSwitch(benPage, PAYMENTS)).toBeChecked();
    await benPage.context().close();

    // The next expense: Chloe still gets it (so the email went out), Ben doesn't.
    const benMid = mailsTo(ben.email).length;
    const chloeMid = mailsTo(chloe.email).length;
    await addExpense(page, { amount: "30", description: "Taxi" });
    await waitForMail(chloe.email, "Ana added Taxi", { after: chloeMid });
    expect(mailsTo(ben.email).slice(benMid)).toEqual([]);
  });

  test("unsubscribe: the link asks first, the button turns the email off, one-click POST works, tampered links don't", async ({ page, browser }, info) => {
    const { me: ana, others } = await setupGroup(page, browser, info, "Studio", "Ana", "Ben");
    const [ben] = others;
    const groupUrl = page.url();

    await addExpense(page, { amount: "50", description: "Paint" });
    const expenseMail = await waitForMail(ben.email, "Ana added Paint");
    const link = unsubscribeLink(expenseMail);
    expect(link).toMatch(/^\/unsubscribe\?u=[^&]+&t=expenses&s=/);

    // Opening the link (GET) only asks; nothing changes yet.
    const benPage = await signedIn(browser, ben);
    await benPage.goto(link);
    await expect(benPage.getByRole("heading", { level: 1, name: "Stop emails about expenses?" })).toBeVisible();
    await expect(benPage.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await benPage.goto("/account");
    await expect(prefSwitch(benPage, EXPENSES)).toBeChecked();

    // Pressing the button does it, and says so.
    await benPage.goto(link);
    await benPage.getByRole("button", { name: "Stop expense emails" }).click();
    const done = benPage.getByRole("heading", { level: 1, name: "Unsubscribed" });
    await expect(done).toBeVisible();
    await expect(done).toBeFocused();
    await expect(benPage.getByText("You won't get these emails any more.")).toBeVisible();
    await benPage.getByRole("link", { name: "Go to Account" }).click();
    await expect(benPage).toHaveURL(/\/account/);
    await expect(prefSwitch(benPage, EXPENSES)).not.toBeChecked();
    await expect(prefSwitch(benPage, PAYMENTS)).toBeChecked();

    // Mail providers' one-click POST (List-Unsubscribe header) needs no login.
    await benPage.goto(groupUrl);
    await settlePanel(benPage).getByRole("button", { name: "Record payment: You pay Ana $25.00" }).click();
    await dialog(benPage, "Settle up").getByRole("button", { name: "Record payment" }).click();
    await expectToast(benPage, "Payment recorded");
    const paymentMail = await waitForMail(ana.email, "Ben paid you $25.00");
    const oneClick = oneClickLink(paymentMail);
    expect(oneClick).toMatch(/^\/api\/unsubscribe\?u=[^&]+&t=payments&s=/);

    const anonymous = await browser.newContext();
    const res = await anonymous.request.post(oneClick, { form: { "List-Unsubscribe": "One-Click" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await page.goto("/account");
    await expect(prefSwitch(page, PAYMENTS)).not.toBeChecked();
    await expect(prefSwitch(page, EXPENSES)).toBeChecked();

    // A tampered signature is refused, both on the page and by the one-click endpoint.
    const tampered = link.replace(/s=([\w-])/, (_, c: string) => `s=${c === "a" ? "b" : "a"}`);
    expect(tampered).not.toBe(link);
    const visitor = await anonymous.newPage();
    await visitor.goto(tampered);
    await expect(visitor.getByRole("heading", { level: 1, name: "This unsubscribe link doesn't work" })).toBeVisible();
    await expect(visitor.getByRole("button", { name: /^Stop / })).toHaveCount(0);
    await expect(visitor.getByRole("link", { name: "Log in" })).toBeVisible();
    // A link for another type with the same signature doesn't work either.
    await visitor.goto(link.replace("t=expenses", "t=payments"));
    await expect(visitor.getByRole("heading", { level: 1, name: "This unsubscribe link doesn't work" })).toBeVisible();
    const bad = await anonymous.request.post(oneClick.replace(/s=([\w-])/, (_, c: string) => `s=${c === "a" ? "b" : "a"}`));
    expect(bad.status()).toBe(400);
    await anonymous.close();

    // Signed in, the invalid state points to the settings instead.
    await benPage.goto(tampered);
    await expect(benPage.getByRole("link", { name: "Open email settings" })).toHaveAttribute("href", "/account#notifications");
    await benPage.context().close();
  });

  test("weekly summary is off by default and the opt-in persists; unconfirmed accounts are told why", async ({ page }, info) => {
    const dee = makeUser(info, "Dee");
    await register(page, dee, { verify: false });
    await page.goto("/account");
    await expect(page.getByTestId("notifications-unconfirmed")).toBeVisible();

    await expect(prefSwitch(page, DIGEST)).not.toBeChecked();
    await expect(prefSwitch(page, EXPENSES)).toBeChecked();
    await expect(prefSwitch(page, REMINDERS)).toBeChecked();

    await prefSwitch(page, DIGEST).click();
    await expectToast(page, "Saved");
    await expect(prefSwitch(page, DIGEST)).toBeChecked();
    await page.reload();
    await expect(prefSwitch(page, DIGEST)).toBeChecked();

    // Keyboard works too: Space toggles the focused switch.
    await prefSwitch(page, DIGEST).focus();
    await page.keyboard.press("Space");
    await expect(prefSwitch(page, DIGEST)).not.toBeChecked();
    await expectToast(page, "Saved");
    await page.goto("/account#notifications");
    await expect(prefSwitch(page, DIGEST)).not.toBeChecked();
  });
});
