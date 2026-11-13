import { expect, test } from "./fixtures";
import { addExpense, expectToast, settlePanel, setupGroup, signedIn } from "./helpers";
import { mailsTo, waitForMail } from "./mail";

test.describe("reminders", () => {
  test("Remind shows only where they owe you, emails a nudge with your payment methods, then cools down", async ({ page, browser }, info) => {
    const { me: ana, others } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    const [ben] = others;
    const groupUrl = page.url();

    // Ana saves her Venmo and PayPal, so the reminder can say how to pay her.
    await page.goto("/account");
    await page.getByLabel("Venmo username").fill("ana-venmo");
    await page.getByLabel("PayPal.me name").fill("anapaypal");
    await page.getByRole("button", { name: "Save payment details" }).click();
    await expectToast(page, "Payment details saved");

    await page.goto(groupUrl);
    await addExpense(page, { amount: "60", description: "Dinner" });

    // Ana's settle-up plan: Ben pays her, so she can remind him (and only him).
    const plan = settlePanel(page);
    await expect(plan.getByRole("button", { name: "Record payment: Ben pays you $30.00" })).toBeVisible();
    await expect(plan.getByTestId("remind-button")).toHaveCount(1);
    const remind = plan.getByRole("button", { name: "Remind Ben", exact: true });
    await expect(remind).toBeVisible();

    // Ben owes, so there's nothing for him to remind anyone about.
    const benPage = await signedIn(browser, ben);
    await benPage.goto(groupUrl);
    await expect(settlePanel(benPage).getByRole("button", { name: "Record payment: You pay Ana $30.00" })).toBeVisible();
    await expect(benPage.getByTestId("remind-button")).toHaveCount(0);
    await benPage.goto("/friends");
    await benPage.getByRole("link").filter({ hasText: "Ana" }).first().click();
    await expect(benPage.getByRole("heading", { level: 1, name: "Ana" })).toBeVisible();
    await expect(benPage.getByTestId("remind-button")).toHaveCount(0);
    await benPage.context().close();

    // Send it: a toast, the button settles on "Reminded", and Ben gets the email.
    const benBefore = mailsTo(ben.email).length;
    await remind.click();
    await expectToast(page, "Reminder sent to Ben");
    await expect(plan.getByRole("button", { name: "Reminded Ben" })).toBeVisible();
    const mail = await waitForMail(ben.email, "Reminder from Ana: $30.00 in Flat", { after: benBefore });
    expect(mail.text).toContain("Ana sent you a friendly reminder: you owe them $30.00 in Flat.");
    expect(mail.text).toContain("You can pay with Venmo or PayPal, then record the payment in BillSplit");
    // Each payment app is a link straight to paying Ana that amount.
    expect(mail.text).toMatch(/Pay Ana \$30\.00 with Venmo: https:\/\/venmo\.com\/\?[^\s]*recipients=ana-venmo[^\s]*amount=30\.00/);
    expect(mail.text).toContain("Pay Ana $30.00 with PayPal: https://paypal.me/anapaypal/30.00USD");
    expect(mail.text).toContain(groupUrl.replace(/^https?:\/\/[^/]+/, ""));
    expect(mail.text).toMatch(/\/unsubscribe\?u=[^&\s]+&t=reminders&s=/);

    // The cooldown is per person, not per group: on Ben's friend page every context (Flat, and the
    // direct balance after a direct expense) already shows "Reminded".
    await page.goto("/friends");
    await page.getByRole("link").filter({ hasText: "Ben" }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: "Ben" })).toBeVisible();
    const friendUrl = page.url();
    // On a friend's page the shell's Add expense starts with that friend.
    await addExpense(page, { amount: "40", description: "Concert" });

    const inFlat = page.getByRole("group", { name: "Flat" });
    const direct = page.getByRole("group", { name: "Direct expenses" });
    await expect(inFlat.getByRole("button", { name: "Reminded Ben" })).toBeVisible();
    await expect(direct.getByRole("button", { name: "Reminded Ben" })).toBeVisible();

    // A second try (a fresh session, so the buttons aren't already "Reminded") hits the 3-day
    // cooldown, in the group and for the direct balance alike.
    const again = await signedIn(browser, ana);
    await again.goto(groupUrl);
    await settlePanel(again).getByRole("button", { name: "Remind Ben", exact: true }).click();
    await expectToast(again, "You already reminded Ben. You can send another in 3 days.");
    await expect(settlePanel(again).getByRole("button", { name: "Remind Ben", exact: true })).toBeVisible();
    await again.goto(friendUrl);
    await again.getByRole("group", { name: "Direct expenses" }).getByRole("button", { name: "Remind Ben", exact: true }).click();
    await expectToast(again, "You already reminded Ben. You can send another in 3 days.");
    await again.context().close();
    // One reminder in all; the cooled-down tries sent nothing.
    expect(
      mailsTo(ben.email)
        .slice(benBefore)
        .filter((m) => m.subject.startsWith("Reminder from"))
        .map((m) => m.subject),
    ).toEqual(["Reminder from Ana: $30.00 in Flat"]);
  });

  test("when they can't get reminder emails, Remind says so instead of claiming it reminded them", async ({ page, browser }, info) => {
    const { others } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    const [ben] = others;
    const groupUrl = page.url();

    const benPage = await signedIn(browser, ben);
    await benPage.goto("/account");
    const toggle = benPage.getByRole("switch", { name: "Reminders when you owe someone" });
    await toggle.click();
    await expectToast(benPage, "Saved");
    await expect(toggle).not.toBeChecked();
    await benPage.context().close();

    await page.goto(groupUrl);
    await addExpense(page, { amount: "60", description: "Dinner" });
    const plan = settlePanel(page);
    const before = mailsTo(ben.email).length;
    await plan.getByRole("button", { name: "Remind Ben", exact: true }).click();
    await expectToast(page, "Ben has reminders turned off, or has no notifications on and no confirmed email, so we couldn't reach them.");
    await expect(plan.getByRole("button", { name: "Couldn't reach Ben" })).toBeVisible();
    await expect(plan.getByRole("button", { name: "Reminded Ben" })).toHaveCount(0);
    expect(mailsTo(ben.email).slice(before).filter((m) => m.subject.startsWith("Reminder from"))).toHaveLength(0);
  });
});
