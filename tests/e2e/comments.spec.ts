import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addExpense, expectToast, expenseLink, setupGroup, signedIn } from "./helpers";
import { pushEndpoint, pushTitles, stubPush, turnOnPush, waitForPush } from "./push";

function comments(page: Page) {
  return page.getByRole("region", { name: "Comments" });
}

async function postComment(page: Page, text: string) {
  await comments(page).getByRole("textbox", { name: "Add a comment" }).fill(text);
  await comments(page).getByRole("button", { name: "Post comment" }).click();
  await expect(comments(page).getByRole("listitem").filter({ hasText: text })).toBeVisible();
  // The optimistic row is replaced by the saved one.
  await expect(comments(page).getByText("Posting…")).toHaveCount(0);
  await expect(comments(page).getByRole("textbox", { name: "Add a comment" })).toHaveValue("");
  // Focus stays in the composer (the button disables once it's empty), and it's announced.
  await expect(comments(page).getByRole("textbox", { name: "Add a comment" })).toBeFocused();
  await expect(comments(page).getByRole("status").filter({ hasText: "Comment posted." })).toBeAttached();
}

test.describe("comments", () => {
  test("Ben comments on Ana's expense, Ana is notified and sees it but can't delete it, Ben deletes his own", async ({ page, browser }, info) => {
    test.setTimeout(90_000);
    const anaDevice = pushEndpoint(info, "ana");
    await stubPush(page, anaDevice, { quietPrompt: true });
    const { others, url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    const [ben] = others;
    await turnOnPush(page);
    await page.goto(url);
    await addExpense(page, { amount: "80", description: "Hotel deposit" });
    await expenseLink(page, "Hotel deposit").click();
    await expect(page.getByRole("heading", { level: 1, name: "Hotel deposit" })).toBeVisible();
    const expenseUrl = page.url();
    await expect(comments(page)).toContainText("No comments yet.");

    // Ben comments.
    const benPage = await signedIn(browser, ben);
    await benPage.goto(expenseUrl);
    await postComment(benPage, "Is breakfast included?\nAsking for the whole flat.");
    const benRow = comments(benPage).getByRole("listitem").filter({ hasText: "Is breakfast included?" });
    await expect(benRow).toContainText("You");
    await expect(benRow.getByRole("button", { name: /^Delete your comment: / })).toBeVisible();

    // Ana's device gets a push that opens the comments.
    const push = await waitForPush(anaDevice, "Ben commented on Hotel deposit");
    expect(push.url).toMatch(/^\/expenses\/[^/]+#comments$/);

    // Ana sees it, attributed to Ben, with no way to delete it.
    await page.reload();
    const onAna = comments(page).getByRole("listitem").filter({ hasText: "Is breakfast included?" });
    await expect(onAna).toContainText("Ben");
    await expect(onAna).toContainText("Asking for the whole flat.");
    await expect(onAna.getByRole("button")).toHaveCount(0);

    // Ana replies; only her own comment has a delete button. Ana isn't notified of her own comment.
    await postComment(page, "Yes, from 7 to 10.");
    await expect(comments(page).getByRole("button", { name: /^Delete your comment: / })).toHaveCount(1);
    expect(pushTitles(anaDevice).filter((t) => t.startsWith("Ana commented"))).toEqual([]);

    // Ben deletes his comment.
    await benPage.reload();
    await comments(benPage).getByRole("button", { name: /^Delete your comment: Is breakfast/ }).click();
    const confirm = benPage.getByRole("alertdialog", { name: "Delete this comment?" });
    await confirm.getByRole("button", { name: "Delete comment" }).click();
    await expectToast(benPage, "Comment deleted");
    await expect(comments(benPage).getByText("Is breakfast included?")).toHaveCount(0);
    await expect(benPage.getByRole("heading", { level: 2, name: "Comments" })).toBeFocused();
    await expect(comments(benPage)).toContainText("Yes, from 7 to 10.");
    // Ben can't delete Ana's reply either.
    await expect(comments(benPage).getByRole("button", { name: /^Delete your comment: / })).toHaveCount(0);
    await benPage.context().close();

    await page.reload();
    await expect(comments(page).getByText("Is breakfast included?")).toHaveCount(0);
    await expect(comments(page)).toContainText("Yes, from 7 to 10.");
  });
});
