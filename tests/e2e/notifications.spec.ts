import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addExpense, dialog, expectToast, makeUser, register, settlePanel, setupGroup, signedIn } from "./helpers";
import { mailsTo, oneClickLink, unsubscribeLink, waitForMail } from "./mail";
import { pushEndpoint, pushTitles, signedInWithPush, stubPush, turnOnPush, waitForPush } from "./push";

/** The notification-type switch with this label on /account. */
function prefSwitch(page: Page, label: string) {
  return page.getByRole("switch", { name: label });
}

const EXPENSES = "When someone adds an expense with you";
const PAYMENTS = "When someone records a payment with you";
const REMINDERS = "Reminders when you owe someone";
const DIGEST = "Weekly summary (Mondays)";

test.describe("notifications", () => {
  test("expense and payment updates arrive as push for the other people, never the actor, respect the switches, and are never emailed", async ({ page, browser }, info) => {
    test.setTimeout(90_000);
    const anaDevice = pushEndpoint(info, "ana");
    const benDevice = pushEndpoint(info, "ben");
    const chloeDevice = pushEndpoint(info, "chloe");
    await stubPush(page, anaDevice, { quietPrompt: true });
    const { me: ana, others, url: groupUrl } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben", "Chloe");
    const [ben, chloe] = others;
    // Everyone turns push on for their device in Account.
    await turnOnPush(page);
    const benPage = await signedInWithPush(browser, ben, benDevice);
    const chloePage = await signedInWithPush(browser, chloe, chloeDevice);
    await chloePage.context().close();
    const mailsBefore = { ana: mailsTo(ana.email).length, ben: mailsTo(ben.email).length, chloe: mailsTo(chloe.email).length };

    // Account says when we still email (this one is confirmed, so no confirm-your-address line).
    const policy = benPage.getByTestId("email-policy");
    await expect(policy).toBeVisible();
    await expect(policy).toContainText(ben.email);
    await expect(policy).toContainText("pass on a reminder when notifications are off");
    await expect(policy).not.toContainText("Reminder emails need a confirmed address.");

    // Ana adds an expense: Ben and Chloe each get a push with what it means for them.
    await page.goto(groupUrl);
    await addExpense(page, { amount: "90", description: "Dinner" });
    const benPush = await waitForPush(benDevice, "Ana added Dinner");
    expect(benPush.body).toBe("You owe $30.00. In Flat.");
    expect(benPush.url).toMatch(/^\/expenses\/[\w-]+$/);
    const chloePush = await waitForPush(chloeDevice, "Ana added Dinner");
    expect(chloePush.body).toBe("You owe $30.00. In Flat.");

    // Ben records his payment: Ana gets a push about it; Ben (the actor) and Chloe (not in it) don't.
    await benPage.goto(groupUrl);
    await settlePanel(benPage).getByRole("button", { name: "Record payment: You pay Ana $30.00" }).click();
    await dialog(benPage, "Settle up").getByRole("button", { name: "Record payment" }).click();
    await expectToast(benPage, "Payment recorded");
    const paid = await waitForPush(anaDevice, "Ben paid you $30.00");
    expect(paid.body).toBe("Ben paid you $30.00 in Flat.");
    expect(paid.url).toBe(new URL(groupUrl).pathname);

    // Ben turns expense notifications off in Account; it saves straight away and survives a reload.
    await benPage.goto("/account#notifications");
    const toggle = prefSwitch(benPage, EXPENSES);
    await expect(toggle).toBeChecked();
    await toggle.click();
    await expectToast(benPage, "Saved");
    await expect(toggle).not.toBeChecked();
    await benPage.reload();
    await expect(prefSwitch(benPage, EXPENSES)).not.toBeChecked();
    await expect(prefSwitch(benPage, PAYMENTS)).toBeChecked();
    await expect(benPage.getByRole("switch", { name: "Push notifications on this device" })).toBeChecked();
    await benPage.context().close();

    // The next expense: Chloe still gets it (so pushes went out), Ben doesn't.
    await addExpense(page, { amount: "30", description: "Taxi" });
    await waitForPush(chloeDevice, "Ana added Taxi");

    // A reminder to someone with push on goes by push only.
    await page.reload();
    await settlePanel(page).getByRole("button", { name: "Remind Chloe", exact: true }).click();
    await expectToast(page, "Reminder sent to Chloe");
    const reminder = await waitForPush(chloeDevice, "Reminder from Ana");
    expect(reminder.body).toBe("You owe Ana $40.00 in Flat. Tap to settle up.");

    // Everything has been delivered by now. Ana never heard about her own expenses; Ben heard only
    // about the first one; Chloe heard nothing about the payment between Ben and Ana.
    expect(pushTitles(anaDevice)).toEqual(["Ben paid you $30.00"]);
    expect(pushTitles(benDevice)).toEqual(["Ana added Dinner"]);
    expect(pushTitles(chloeDevice)).toEqual(["Ana added Dinner", "Ana added Taxi", "Reminder from Ana"]);
    // And none of it was emailed.
    expect(mailsTo(ana.email).slice(mailsBefore.ana)).toEqual([]);
    expect(mailsTo(ben.email).slice(mailsBefore.ben)).toEqual([]);
    expect(mailsTo(chloe.email).slice(mailsBefore.chloe)).toEqual([]);
  });

  test("unsubscribe (from a reminder email, sent because they have no push device): the link asks first, the button turns it off, one-click POST works, tampered links don't", async ({ page, browser }, info) => {
    const { others } = await setupGroup(page, browser, info, "Studio", "Ana", "Ben", "Chloe");
    const [ben, chloe] = others;
    await addExpense(page, { amount: "60", description: "Paint" });

    // Ben and Chloe have no push devices, so Ana's reminders fall back to email.
    const plan = settlePanel(page);
    await plan.getByRole("button", { name: "Remind Ben", exact: true }).click();
    await expectToast(page, "Reminder sent to Ben");
    await plan.getByRole("button", { name: "Remind Chloe", exact: true }).click();
    await expectToast(page, "Reminder sent to Chloe");
    const benMail = await waitForMail(ben.email, "Reminder from Ana: $20.00 in Studio");
    expect(benMail.text).toContain("Unsubscribe from these emails:");
    expect(benMail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const link = unsubscribeLink(benMail);
    expect(link).toMatch(/^\/unsubscribe\?u=[^&]+&t=reminders&s=/);

    // Opening the link (GET) only asks; nothing changes yet.
    const benPage = await signedIn(browser, ben);
    await benPage.goto(link);
    await expect(benPage.getByRole("heading", { level: 1, name: "Stop reminders?" })).toBeVisible();
    await expect(benPage.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
    await benPage.goto("/account");
    await expect(prefSwitch(benPage, REMINDERS)).toBeChecked();

    // Pressing the button does it, and says so.
    await benPage.goto(link);
    await benPage.getByRole("button", { name: "Stop reminders" }).click();
    const done = benPage.getByRole("heading", { level: 1, name: "Unsubscribed" });
    await expect(done).toBeVisible();
    await expect(done).toBeFocused();
    await expect(benPage.getByText("You won't get these emails any more.")).toBeVisible();
    await benPage.getByRole("link", { name: "Go to Account" }).click();
    await expect(benPage).toHaveURL(/\/account/);
    await expect(prefSwitch(benPage, REMINDERS)).not.toBeChecked();
    await expect(prefSwitch(benPage, EXPENSES)).toBeChecked();
    await expect(prefSwitch(benPage, PAYMENTS)).toBeChecked();

    // Mail providers' one-click POST (List-Unsubscribe header) needs no login.
    const chloeMail = await waitForMail(chloe.email, "Reminder from Ana: $20.00 in Studio");
    const oneClick = oneClickLink(chloeMail);
    expect(oneClick).toMatch(/^\/api\/unsubscribe\?u=[^&]+&t=reminders&s=/);
    const anonymous = await browser.newContext();
    const res = await anonymous.request.post(oneClick, { form: { "List-Unsubscribe": "One-Click" } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const chloePage = await signedIn(browser, chloe);
    await chloePage.goto("/account");
    await expect(prefSwitch(chloePage, REMINDERS)).not.toBeChecked();
    await expect(prefSwitch(chloePage, EXPENSES)).toBeChecked();
    await chloePage.context().close();

    // A tampered signature is refused, both on the page and by the one-click endpoint.
    const tampered = link.replace(/s=([\w-])/, (_, c: string) => `s=${c === "a" ? "b" : "a"}`);
    expect(tampered).not.toBe(link);
    const visitor = await anonymous.newPage();
    await visitor.goto(tampered);
    await expect(visitor.getByRole("heading", { level: 1, name: "This unsubscribe link doesn't work" })).toBeVisible();
    await expect(visitor.getByRole("button", { name: /^Stop / })).toHaveCount(0);
    await expect(visitor.getByRole("link", { name: "Log in" })).toBeVisible();
    // A link for another type with the same signature doesn't work either.
    await visitor.goto(link.replace("t=reminders", "t=payments"));
    await expect(visitor.getByRole("heading", { level: 1, name: "This unsubscribe link doesn't work" })).toBeVisible();
    const bad = await anonymous.request.post(oneClick.replace(/s=([\w-])/, (_, c: string) => `s=${c === "a" ? "b" : "a"}`));
    expect(bad.status()).toBe(400);
    await anonymous.close();

    // Signed in, the invalid state points to the settings instead.
    await benPage.goto(tampered);
    await expect(benPage.getByRole("link", { name: "Open notification settings" })).toHaveAttribute("href", "/account#notifications");
    await benPage.context().close();
  });

  test("weekly summary is off by default and the opt-in persists; Account explains when we email, and unconfirmed accounts are told why", async ({ page }, info) => {
    const dee = makeUser(info, "Dee");
    await register(page, dee, { verify: false });
    await page.goto("/account");
    // One "Notifications" section (the old "Email notifications" one is gone).
    const section = page.getByRole("region", { name: "Notifications", exact: true });
    await expect(section.getByRole("heading", { level: 2, name: "Notifications" })).toBeVisible();
    await expect(section.getByRole("heading", { name: "What to notify me about" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Email notifications" })).toHaveCount(0);
    const policy = section.getByTestId("email-policy");
    await expect(policy).toBeVisible();
    await expect(policy).toContainText(dee.email);
    await expect(policy).toContainText("Reminder emails need a confirmed address.");
    const resend = policy.getByRole("link", { name: "Resend the confirmation link" });
    await expect(resend).toHaveAttribute("href", "#email-status");
    // It takes keyboard users straight to the Resend button.
    await resend.click();
    await expect(page.locator("#email-status").getByRole("button", { name: "Resend link" })).toBeFocused();

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
