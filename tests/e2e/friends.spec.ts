import { expect, test } from "./fixtures";
import { addExpense, addMember, createGroup, dialog, expectToast, setupUsers } from "./helpers";

test.describe("friends", () => {
  test("add a friend, split directly and in a group, settle up, then remove", async ({ page, browser }, info) => {
    const { others } = await setupUsers(page, browser, info, "Ana", "Maya");
    const maya = others[0];

    await page.goto("/friends");
    await expect(page.getByRole("heading", { name: "No friends yet" })).toBeVisible();

    // An email with no account asks for a name; correcting it to a real account goes back to "Add friend" (the name field stays, and is ignored).
    await page.getByRole("button", { name: "Add friend" }).first().click();
    const sheet = dialog(page, "Add friend");
    await sheet.getByLabel("Email").fill(`ghost.${Date.now()}@example.test`);
    await sheet.getByRole("button", { name: "Add friend" }).click();
    await expect(sheet.getByText("Nobody has signed up with that email yet. Add their name and we'll invite them.")).toBeVisible();
    await expect(sheet.getByLabel("Their name")).toBeFocused();
    await expect(sheet.getByRole("button", { name: "Invite them" })).toBeVisible();
    await sheet.getByLabel("Their name").fill("Typo");
    await sheet.getByLabel("Email").fill(maya.email);
    await expect(sheet.getByLabel("Their name")).toHaveValue("Typo");
    await sheet.getByRole("button", { name: "Add friend" }).click();
    await expectToast(page, "Friend added");
    await expect(sheet).toBeHidden();

    const row = page.getByRole("link").filter({ hasText: "Maya" });
    await expect(row).toContainText("settled up");
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: "Maya" })).toBeVisible();
    await expect(page.getByText("You and Maya are settled up")).toBeVisible();
    const friendUrl = page.url();

    // A direct expense: I paid $60, split equally.
    await page.getByRole("region", { name: "Shared history" }).getByRole("button", { name: "Add expense" }).click();
    const expense = dialog(page, "Add expense");
    await expect(expense.getByText("With Maya")).toBeVisible();
    await expense.getByLabel(/^Amount/).fill("60");
    await expense.getByLabel("Description").fill("Concert tickets");
    await expense.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");

    const balance = page.getByRole("region", { name: /^Your balance with Maya/ });
    await expect(balance).toContainText("Maya owes you");
    await expect(balance).toContainText("$30.00");

    // A group expense with Maya: she paid $40, split equally.
    await createGroup(page, "Flat 3B");
    await addMember(page, maya.email);
    await addExpense(page, { amount: "40", description: "Cleaning supplies", paidBy: "Maya" });

    await page.goto(friendUrl);
    await expect(balance).toContainText("Maya owes you");
    await expect(balance).toContainText("$10.00");
    const breakdown = page.getByRole("list", { name: "How your balance with Maya adds up" });
    await expect(breakdown.getByRole("listitem")).toHaveCount(2);
    await expect(breakdown).toContainText("Flat 3B: You owe Maya $20.00");
    await expect(breakdown).toContainText("Direct expenses: Maya owes you $30.00");
    const history = page.getByRole("region", { name: "Shared history" });
    await expect(history.getByText("Concert tickets")).toBeVisible();
    await expect(history.getByText("Cleaning supplies")).toBeVisible();

    // Removing is blocked while the direct balance is open.
    await page.getByRole("button", { name: "Remove friend" }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Remove friend" }).click();
    await expect(confirm.getByText("Settle up your direct balance before removing this friend.")).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel" }).click();

    // Settle the direct part.
    await breakdown.getByRole("button", { name: "Settle up in Direct expenses" }).click();
    const settle = dialog(page, "Settle up");
    await expect(settle.getByLabel("Amount")).toHaveValue("30.00");
    await expect(settle.getByText("Maya paid you $30.00")).toBeVisible();
    await settle.getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");
    await expect(breakdown.getByRole("listitem")).toHaveCount(1);
    await expect(balance).toContainText("You owe Maya");
    await expect(balance).toContainText("$20.00");

    // Now the friend can be removed; the group balance stays in the group.
    await page.getByRole("button", { name: "Remove friend" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove friend" }).click();
    await expectToast(page, "Friend removed");
    await expect(page).toHaveURL(/\/friends$/);
  });

  test("you can't add yourself or the same friend twice", async ({ page, browser }, info) => {
    const { me, others } = await setupUsers(page, browser, info, "Ana", "Ben");
    await page.goto("/friends?add=1");
    const sheet = dialog(page, "Add friend");
    await expect(sheet).toBeVisible();
    await sheet.getByLabel("Email").fill(me.email);
    await sheet.getByRole("button", { name: "Add friend" }).click();
    await expect(sheet.getByText("That's your own email.").first()).toBeVisible();
    await sheet.getByLabel("Email").fill(others[0].email);
    await sheet.getByRole("button", { name: "Add friend" }).click();
    await expectToast(page, "Friend added");

    await page.getByRole("button", { name: "Add friend" }).first().click();
    await dialog(page, "Add friend").getByLabel("Email").fill(others[0].email);
    await dialog(page, "Add friend").getByRole("button", { name: "Add friend" }).click();
    await expect(dialog(page, "Add friend").getByText("You and Ben are already friends.").first()).toBeVisible();
  });
});
