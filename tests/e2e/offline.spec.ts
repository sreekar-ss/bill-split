import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { addMember, createGroup, dialog, expectToast, expenseSheet, fillExpense, login, nav, setupGroup, shellAddExpense, signedIn } from "./helpers";

interface Queued {
  clientId: string;
  userId: string;
  input: { description: string };
}

/** Everything in the app's offline queue (IndexedDB "billsplit-offline" / "expenses") on this origin. */
function readQueue(page: Page): Promise<Queued[]> {
  return page.evaluate(
    () =>
      new Promise<Queued[]>((resolve, reject) => {
        const req = indexedDB.open("billsplit-offline", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("expenses", { keyPath: "clientId" });
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const all = db.transaction("expenses", "readonly").objectStore("expenses").getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as Queued[]);
          };
          all.onerror = () => reject(all.error);
        };
      }),
  );
}

/** Puts an item back in the queue, as if a flush had sent it but never got to remove it. */
function requeue(page: Page, item: Queued): Promise<void> {
  return page.evaluate(
    (it) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("billsplit-offline", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("expenses", "readwrite");
          tx.objectStore("expenses").put(it);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    item,
  );
}

/** Waits until the service worker controls the page and has the offline page cached. */
async function offlineReady(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/offline"))), { timeout: 15_000 }).toBe(true);
}

function indicator(page: Page) {
  return page.getByTestId("offline-indicator");
}

async function addSimpleExpense(page: Page, amount: string, description: string) {
  await shellAddExpense(page).click();
  const sheet = expenseSheet(page);
  await expect(sheet).toBeVisible();
  await fillExpense(sheet, { amount, description });
  await sheet.getByRole("button", { name: "Save expense" }).click();
  return sheet;
}

test.describe("offline", () => {
  test("an expense added offline waits on the device, then syncs exactly once; new pages show the offline page", async ({ page, context, browser }, info) => {
    test.setTimeout(90_000);
    const { url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    await offlineReady(page);

    await context.setOffline(true);
    await expect(indicator(page)).toContainText("You're offline. Expenses you add are saved on this device.");

    const sheet = await addSimpleExpense(page, "25", "Offline snacks");
    await expectToast(page, "Saved offline. We'll add it when you're back online.");
    await expect(sheet).toBeHidden();
    await expect(indicator(page)).toContainText("You're offline. 1 expense waiting to sync.");
    const queued = await readQueue(page);
    expect(queued.map((q) => q.input.description)).toEqual(["Offline snacks"]);

    // What's waiting can be listed, so nobody has to guess whether it was saved.
    await indicator(page).getByRole("button", { name: "Show" }).click();
    const waitingRow = page.getByRole("list", { name: "Saved on this device" }).getByRole("listitem");
    await expect(waitingRow).toHaveCount(1);
    await expect(waitingRow).toContainText("Offline snacks");
    await expect(waitingRow).toContainText("$25.00 in Flat");
    await expect(waitingRow).toContainText("Waiting to sync");
    await indicator(page).getByRole("button", { name: "Hide" }).click();

    // Entering the same expense again is caught before it becomes a duplicate.
    const twin = await addSimpleExpense(page, "25", "offline snacks");
    await expect(twin.getByRole("alert")).toContainText("You already saved 'Offline snacks' for this amount on this device.");
    await expect(twin.getByRole("button", { name: "Save it again" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(twin).toBeHidden();
    expect(await readQueue(page)).toHaveLength(1);

    // Tapping another page while offline keeps you in the app instead of dropping you on the offline page.
    const here = page.url();
    await nav(page).getByRole("link", { name: "Friends" }).click();
    await expectToast(page, "That page needs a connection.");
    expect(page.url()).toBe(here);

    // A repeating expense can't wait offline: the form says so and stays open.
    await shellAddExpense(page).click();
    const repeat = expenseSheet(page);
    await fillExpense(repeat, { amount: "10", description: "Weekly flowers" });
    await repeat.getByRole("radiogroup", { name: "Repeat" }).getByRole("radio", { name: "Weekly" }).click();
    await repeat.getByRole("button", { name: "Save expense" }).click();
    await expect(repeat.getByText(/^Repeating expenses need a connection\./)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(repeat).toBeHidden();

    // Back online: it's sent once and shows in the ledger.
    await context.setOffline(false);
    await expectToast(page, "Added 'Offline snacks'");
    await expect(indicator(page)).not.toContainText("waiting");
    await expect.poll(() => readQueue(page)).toEqual([]);
    await page.goto(url);
    await expect(page.getByRole("link").filter({ hasText: "Offline snacks" })).toHaveCount(1);

    // A second flush of the same item (say, the removal never happened) doesn't add it twice.
    await requeue(page, queued[0]);
    await page.reload();
    await expectToast(page, "Added 'Offline snacks'");
    await expect.poll(() => readQueue(page)).toEqual([]);
    await page.reload();
    await expect(page.getByRole("link").filter({ hasText: "Offline snacks" })).toHaveCount(1);
    await expect(page.getByRole("link").filter({ hasText: "Weekly flowers" })).toHaveCount(0);

    // Opening a page while offline shows the offline page (from the service worker), which reloads once back.
    await context.setOffline(true);
    await page.goto("/friends");
    await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await context.setOffline(false);
    await expect(page.getByRole("heading", { level: 1, name: "Friends" })).toBeVisible({ timeout: 15_000 });
  });

  test("an expense the server refuses stays on the device to review and save elsewhere", async ({ page, context, browser }, info) => {
    test.setTimeout(120_000);
    const { others, url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    const [ben] = others;
    await createGroup(page, "Trip");
    await addMember(page, ben.email);
    await page.goto(url);
    await offlineReady(page);

    await context.setOffline(true);
    await addSimpleExpense(page, "12", "Late pizza");
    await expectToast(page, "Saved offline.");

    // Meanwhile Ben archives Flat, so the server will refuse it.
    const benPage = await signedIn(browser, ben);
    await benPage.goto(url);
    await benPage.getByRole("button", { name: "Group settings" }).click();
    await dialog(benPage, "Group settings").getByRole("button", { name: "Archive group" }).click();
    await benPage.getByRole("alertdialog", { name: "Archive Flat?" }).getByRole("button", { name: "Archive group" }).click();
    await expectToast(benPage, "Group archived");

    // Back online: it isn't added, and it isn't lost either.
    await context.setOffline(false);
    await expectToast(page, "Couldn't add 'Late pizza'");
    await expect(indicator(page)).toContainText("1 expense couldn't be added.");
    expect((await readQueue(page)).map((q) => q.input.description)).toEqual(["Late pizza"]);

    await indicator(page).getByRole("button", { name: "Show" }).click();
    const row = page.getByRole("list", { name: "Saved on this device" }).getByRole("listitem");
    await expect(row).toContainText("Couldn't add it: This group is archived.");
    await row.getByRole("button", { name: "Review Late pizza" }).click();

    // Review reopens it filled in, with the reason; saving it to Trip clears it from the device.
    const review = expenseSheet(page);
    await expect(review.getByLabel("Description")).toHaveValue("Late pizza");
    await expect(review.getByLabel(/^Amount/)).toHaveValue("12.00");
    await expect(review.getByRole("alert")).toContainText("This group is archived.");
    await review.getByLabel("Split with").selectOption({ label: "Trip" });
    await review.getByRole("button", { name: "Save expense" }).click();
    await expectToast(page, "Expense saved");
    await expect.poll(() => readQueue(page)).toEqual([]);
    await expect(indicator(page)).not.toContainText("couldn't");
  });
});

test.describe("offline queue across accounts", () => {
  // Request interception (to make saves unreachable) needs requests to bypass the service worker.
  test.use({ serviceWorkers: "block" });

  test("an expense queued by Ana is never sent after she logs out and Ben logs in on the same device", async ({ page, browser }, info) => {
    test.setTimeout(90_000);
    const { others, url } = await setupGroup(page, browser, info, "Flat", "Ana", "Ben");
    const [ben] = others;
    const secret = "Ana's unsent groceries";

    // The browser thinks it's online, but saving can't reach the server (a captive portal, say).
    const sends: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.postData()?.includes(secret)) sends.push(req.url());
    });
    const blockSaves = (route: import("@playwright/test").Route) =>
      route.request().method() === "POST" && route.request().postData()?.includes(secret) ? route.abort("internetdisconnected") : route.fallback();
    await page.route("**/*", blockSaves);

    const sheet = await addSimpleExpense(page, "18", secret);
    await expectToast(page, "Saved offline. We'll add it when you're back online.");
    await expect(sheet).toBeHidden();
    await expect(indicator(page)).toContainText("1 expense waiting to sync");
    expect((await readQueue(page)).map((q) => q.input.description)).toEqual([secret]);

    // Logging out tries to send it first, then warns that it's still waiting and clears it from the device.
    const [anaItem] = await readQueue(page);
    await page.goto("/account");
    await page.getByRole("button", { name: "Log out", exact: true }).click();
    const warn = page.getByRole("alertdialog", { name: "Log out with unsynced expenses?" });
    await expect(warn).toContainText("1 expense saved on this device hasn't been added yet.");
    await warn.getByRole("button", { name: "Log out anyway" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await readQueue(page)).toEqual([]);
    await page.unroute("**/*", blockSaves);
    sends.length = 0;

    // Even if an item survived logout (say, clearing failed), Ben signing in on the same browser
    // drops it: it is never sent as Ben.
    await requeue(page, anaItem);
    await login(page, ben.email, ben.password);
    await expect(page).toHaveURL(/\/home$/);
    await expect.poll(() => readQueue(page)).toEqual([]);
    await expect(indicator(page)).not.toContainText("waiting");
    await page.goto(url);
    await expect(page.getByRole("heading", { level: 1, name: "Flat" })).toBeVisible();
    await expect(page.getByRole("link").filter({ hasText: secret })).toHaveCount(0);
    expect(sends).toEqual([]);
  });
});
