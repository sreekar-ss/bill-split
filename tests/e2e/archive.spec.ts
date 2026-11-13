import { expect, test } from "./fixtures";
import { addExpense, addMember, createGroup, dialog, expectToast, expenseLink, expenseSheet, setupGroup, settlePanel, shellAddExpense, signedIn } from "./helpers";

test.describe("group emoji and archive", () => {
  test("set an emoji; archiving needs everyone settled; an archived group is read-only and moves under Archived; unarchive restores it", async ({ page, browser }, info) => {
    test.setTimeout(120_000);
    const { others, url } = await setupGroup(page, browser, info, "Lisbon trip", "Ana", "Ben");
    const [ben] = others;
    await addExpense(page, { amount: "40", description: "Tram tickets" });

    // Emoji, in Group settings.
    await page.getByRole("button", { name: "Group settings" }).click();
    let sheet = dialog(page, "Group settings");
    // The radio is visually hidden inside its emoji tile; people tap the tile.
    const beach = sheet.getByRole("radio", { name: "Beach" });
    await sheet.locator("label").filter({ has: page.getByRole("radio", { name: "Beach" }) }).click();
    await expect(beach).toBeChecked();
    await sheet.getByRole("button", { name: "Save changes" }).click();
    await expectToast(page, "Changes saved");
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Lisbon trip" })).toContainText("🏖️");

    await page.goto("/groups");
    await expect(page.getByRole("list", { name: "Your groups" }).getByRole("link").filter({ hasText: "Lisbon trip" })).toContainText("🏖️");
    await page.goto("/home");
    await expect(page.getByRole("list", { name: "Groups" }).getByRole("link").filter({ hasText: "Lisbon trip" })).toContainText("🏖️");

    // Archiving with an open balance isn't offered: the button is disabled and says why.
    // (The server refusing it anyway is covered by the integration tests.)
    await page.goto(url);
    await page.getByRole("button", { name: "Group settings" }).click();
    sheet = dialog(page, "Group settings");
    const archiveButton = sheet.getByRole("button", { name: "Archive group" });
    await expect(archiveButton).toBeDisabled();
    await expect(archiveButton).toHaveAccessibleDescription("Settle up everyone first. Then you can archive the group.");
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();

    // Ben pays Ana back; now it can be archived.
    await settlePanel(page).getByRole("button", { name: "Record payment: Ben pays you $20.00" }).click();
    await dialog(page, "Settle up").getByRole("button", { name: "Record payment" }).click();
    await expectToast(page, "Payment recorded");

    // A second, active group, so Add expense still has somewhere to go.
    await createGroup(page, "Flat");
    await addMember(page, ben.email);

    await page.goto(url);
    await page.getByRole("button", { name: "Group settings" }).click();
    sheet = dialog(page, "Group settings");
    await sheet.getByRole("button", { name: "Archive group" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Archive Lisbon trip?" });
    await confirm.getByRole("button", { name: "Archive group" }).click();
    await expectToast(page, "Group archived");
    await expect(sheet).toBeHidden();

    // Read-only: a banner, and no add, invite, settle or Add expense actions.
    const banner = page.getByRole("region", { name: "Archived group" });
    await expect(banner).toContainText("This group is read-only.");
    await expect(page.getByRole("button", { name: "Add member" }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Invite with a link" }).filter({ visible: true })).toHaveCount(0);
    await expect(settlePanel(page).getByRole("button", { name: /^Record/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add expense", exact: true }).filter({ visible: true })).toHaveCount(0);

    // Its expenses can still be read, but not edited or commented on.
    await expenseLink(page, "Tram tickets").click();
    await expect(page.getByRole("heading", { level: 1, name: "Tram tickets" })).toBeVisible();
    await expect(page.getByText("This group is archived. Unarchive it on the group page to edit this expense.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Add a comment" })).toHaveCount(0);

    // The groups list moves it under "Archived (1)".
    await page.goto("/groups");
    await expect(page.getByRole("list", { name: "Your groups" })).not.toContainText("Lisbon trip");
    const archivedToggle = page.getByText("Archived (1)");
    await expect(archivedToggle).toBeVisible();
    await archivedToggle.click();
    await expect(page.getByRole("list", { name: "Archived groups" })).toContainText("Lisbon trip");
    // Home lists only active groups.
    await page.goto("/home");
    await expect(page.getByRole("list", { name: "Groups" })).not.toContainText("Lisbon trip");

    // Add expense doesn't offer the archived group.
    await shellAddExpense(page).click();
    const add = expenseSheet(page);
    const options = await add.getByLabel("Split with").locator("option").allInnerTexts();
    expect(options).toContain("Flat");
    expect(options).not.toContain("Lisbon trip");
    await page.keyboard.press("Escape");
    await expect(add).toBeHidden();

    // Ben (another member) sees it archived too.
    const benPage = await signedIn(browser, ben);
    await benPage.goto(url);
    await expect(benPage.getByRole("region", { name: "Archived group" })).toBeVisible();
    await benPage.context().close();

    // Unarchive from the banner: everything comes back.
    await page.goto(url);
    await page.getByRole("region", { name: "Archived group" }).getByRole("button", { name: "Unarchive" }).click();
    await expectToast(page, "Group unarchived");
    await expect(page.getByRole("region", { name: "Archived group" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add member" }).filter({ visible: true }).first()).toBeVisible();
    await expect(shellAddExpense(page)).toBeVisible();
    await page.goto("/groups");
    await expect(page.getByText(/^Archived \(/)).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Your groups" })).toContainText("Lisbon trip");
  });
});
