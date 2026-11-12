import { expect, test } from "./fixtures";
import { addExpense, addMember, createGroup, expectNotFound, makeUser, register } from "./helpers";

/**
 * Pages for groups, friends and expenses you can't access answer with a real HTTP 404 (not a
 * streamed 200 that only looks like a 404), and still render the in-app "We couldn't find that".
 */
test("groups, expenses and friends you can't access respond with HTTP 404", async ({ page, browser }, info) => {
  // Ben and Chloe share a group with an expense; Ana is in none of it.
  const ben = makeUser(info, "Ben");
  const chloe = makeUser(info, "Chloe");
  const other = await browser.newContext();
  const benPage = await other.newPage();
  const chloeContext = await browser.newContext();
  await register(await chloeContext.newPage(), chloe);
  await chloeContext.close();
  await register(benPage, ben);
  const groupUrl = await createGroup(benPage, "Private flat");
  await addMember(benPage, chloe.email);
  await addExpense(benPage, { amount: "30", description: "Secret groceries" });
  await benPage.getByRole("link").filter({ hasText: "Secret groceries" }).first().click();
  await expect(benPage).toHaveURL(/\/expenses\/[^/]+$/);
  const expenseUrl = benPage.url();
  await benPage.goto("/friends");
  await benPage.getByRole("link").filter({ hasText: "Chloe" }).first().click();
  await expect(benPage).toHaveURL(/\/friends\/[^/]+$/);
  const friendUrl = benPage.url();
  // Ben can open all three.
  for (const url of [groupUrl, expenseUrl, friendUrl]) {
    expect((await benPage.request.get(url, { maxRedirects: 0 })).status(), url).toBe(200);
  }
  await other.close();

  const ana = makeUser(info, "Ana");
  await register(page, ana);
  const path = (u: string) => new URL(u).pathname;
  const targets = [
    path(groupUrl),
    path(expenseUrl),
    path(friendUrl),
    "/groups/does-not-exist",
    "/expenses/does-not-exist",
    "/friends/does-not-exist",
  ];
  for (const target of targets) {
    // The raw document response: status is decided before anything is streamed.
    const res = await page.request.get(target, { maxRedirects: 0 });
    expect(res.status(), target).toBe(404);
    // And in the browser: the status plus the in-app not-found page inside the shell.
    const nav = await page.goto(target);
    expect(nav?.status(), target).toBe(404);
    await expectNotFound(page);
  }

  // Your own pages still load normally (200).
  const mine = await createGroup(page, "Ana's own");
  expect((await page.request.get(path(mine), { maxRedirects: 0 })).status()).toBe(200);
});
