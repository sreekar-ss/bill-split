import { expect, test } from "./fixtures";
import { addExpense, addMember, createGroup, dialog, expectBeam, expectToast, makeUser, register } from "./helpers";

test("the payee's saved handles become prefilled payment links in settle up", async ({ page, browser }, info) => {
  const ana = makeUser(info, "Ana");
  const ben = makeUser(info, "Ben");

  await register(page, ana);

  // Ben saves his Venmo and PayPal handles on Account, and adds Ana as a friend: he's chosen to deal
  // with her, so she gets to see his handles (being added by someone isn't enough).
  const benContext = await browser.newContext();
  const benPage = await benContext.newPage();
  await register(benPage, ben);
  await benPage.goto("/account");
  const save = benPage.getByRole("button", { name: "Save payment details" });
  await expect(save).toBeDisabled();
  await benPage.getByLabel("Venmo username").fill("@ben-venmo");
  await benPage.getByLabel("PayPal.me name").fill("benpaypal");
  await save.click();
  await expectToast(benPage, "Payment details saved");
  await benPage.reload();
  await expect(benPage.getByLabel("Venmo username")).toHaveValue("ben-venmo");
  await expect(benPage.getByLabel("PayPal.me name")).toHaveValue("benpaypal");
  await benPage.goto("/friends");
  await benPage.getByRole("button", { name: "Add friend" }).first().click();
  await dialog(benPage, "Add friend").getByLabel("Email").fill(ana.email);
  await dialog(benPage, "Add friend").getByRole("button", { name: "Add friend" }).click();
  await expectToast(benPage, "Friend added");
  await benContext.close();

  // Ana owes Ben $30 in a USD group.
  await createGroup(page, "Beach house", "USD");
  await addMember(page, ben.email);
  await addExpense(page, { amount: "60", description: "Groceries", paidBy: "Ben" });
  await expectBeam(page, "You", "owe $30.00");

  await page.getByRole("button", { name: /^Record payment: You pay Ben/ }).click();
  const sheet = dialog(page, "Settle up");
  await expect(sheet.getByRole("heading", { name: "Pay Ben $30.00 with" })).toBeVisible();

  const venmo = sheet.getByRole("link", { name: /with Venmo/ });
  const venmoUrl = new URL((await venmo.getAttribute("href"))!);
  expect(venmoUrl.origin).toBe("https://venmo.com");
  expect(venmoUrl.searchParams.get("txn")).toBe("pay");
  expect(venmoUrl.searchParams.get("recipients")).toBe("ben-venmo");
  expect(venmoUrl.searchParams.get("amount")).toBe("30.00");
  expect(venmoUrl.searchParams.get("note")).toBe("Beach house");
  await expect(venmo).toHaveAttribute("target", "_blank");
  await expect(venmo).toHaveAttribute("rel", /noopener/);
  // The visible label is just "Venmo"; the link's name says who and how much.
  await expect(venmo).toHaveAccessibleName("Pay Ben $30.00 with Venmo (opens in a new tab)");

  const paypal = sheet.getByRole("link", { name: /with PayPal/ });
  await expect(paypal).toHaveAttribute("href", "https://paypal.me/benpaypal/30.00USD");
  // Ben has no Cash App or UPI handle, so those aren't offered.
  await expect(sheet.getByRole("link", { name: /Cash App|UPI/ })).toHaveCount(0);
  await expect(sheet.getByText("After paying, record it here so balances update.")).toBeVisible();

  // Paying part of it updates the links.
  await sheet.getByLabel("Amount", { exact: true }).fill("12.50");
  await expect(sheet.getByRole("heading", { name: "Pay Ben $12.50 with" })).toBeVisible();
  await expect(paypal).toHaveAttribute("href", "https://paypal.me/benpaypal/12.50USD");
  expect(new URL((await venmo.getAttribute("href"))!).searchParams.get("amount")).toBe("12.50");

  // Then record what was paid.
  await sheet.getByRole("button", { name: "Record payment" }).click();
  await expectToast(page, "Payment recorded");
  await expect(sheet).toBeHidden();
  await expectBeam(page, "You", "owe $17.50");

  // When Ana is the one being paid, there's nothing to deep-link to: her handles are empty.
  await page.getByRole("button", { name: /^Record a different payment$/ }).click();
  await sheet.getByLabel("From").selectOption({ label: "Ben" });
  await expect(sheet.getByRole("link", { name: /with Venmo/ })).toHaveCount(0);
  await sheet.getByLabel("From").selectOption({ label: "You" });
  await sheet.getByLabel("Amount", { exact: true }).fill("5");
  await expect(sheet.getByRole("heading", { name: "Pay Ben $5.00 with" })).toBeVisible();
});

test("someone you added doesn't show you their handles until they've dealt with you", async ({ page, browser }, info) => {
  const ana = makeUser(info, "Ana");
  const ben = makeUser(info, "Ben");
  // Ben has a Venmo handle, but he's never done anything with Ana.
  const benContext = await browser.newContext();
  const benPage = await benContext.newPage();
  await register(benPage, ben);
  await benPage.goto("/account");
  await benPage.getByLabel("Venmo username").fill("ben-venmo");
  await benPage.getByRole("button", { name: "Save payment details" }).click();
  await expectToast(benPage, "Payment details saved");

  await register(page, ana);
  const groupUrl = await createGroup(page, "Flat", "USD");
  await addMember(page, ben.email);
  await addExpense(page, { amount: "20", description: "Milk", paidBy: "Ben" });
  await page.getByRole("button", { name: /^Record payment: You pay Ben/ }).click();
  const sheet = dialog(page, "Settle up");
  await expect(sheet.getByText("Ben hasn't shared a payment app with you yet. Pay them another way, then record it here.")).toBeVisible();
  await expect(sheet.getByRole("link")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Close" }).first().click();

  // Once Ben records something in the group himself, his handle shows up for Ana.
  await benPage.goto(groupUrl);
  await addExpense(benPage, { amount: "4", description: "Bread", paidBy: "You" });
  await benContext.close();
  await page.reload();
  await page.getByRole("button", { name: /^Record payment: You pay Ben/ }).click();
  await expect(sheet.getByRole("link", { name: /with Venmo/ })).toBeVisible();
});
