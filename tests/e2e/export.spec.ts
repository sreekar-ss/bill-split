import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";
import { addExpense, dialog, makeUser, registerElsewhere, setupGroup, signedIn } from "./helpers";

/** Minimal RFC 4180 parser: quoted cells, doubled quotes, CRLF rows. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      if (ch === "\r") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

test.describe("CSV export", () => {
  test("a member downloads the group's expenses and payments; formulas are neutralised; others can't", async ({ page, browser }, info) => {
    const chloe = await registerElsewhere(browser, makeUser(info, "Chloe"));
    const { url } = await setupGroup(page, browser, info, "Book club", "Ana", "Ben");
    const groupId = new URL(url).pathname.split("/").pop()!;
    await addExpense(page, { amount: "20", description: "=HYPERLINK(\"http://evil.test\",\"Snacks\")", category: "Food and drink", date: "2026-10-02" });
    await addExpense(page, { amount: "30.50", description: "Books, paperback", paidBy: "Ben", date: "2026-10-05" });

    await page.getByRole("button", { name: "Group settings" }).click();
    const sheet = dialog(page, "Group settings");
    const link = sheet.getByRole("link", { name: "Export CSV" });
    await link.scrollIntoViewIfNeeded();
    const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
    expect(download.suggestedFilename()).toMatch(/^book-club-billsplit-\d{4}-\d{2}-\d{2}\.csv$/);

    const raw = readFileSync((await download.path())!, "utf8");
    expect(raw.charCodeAt(0)).toBe(0xfeff); // BOM, so Excel reads UTF-8
    const rows = parseCsv(raw.slice(1));
    expect(rows[0]).toEqual(["Date", "Type", "Description", "Category", "Paid by", "Amount", "Currency", "Ana share", "Ben share", "Notes"]);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(["2026-10-02", "Expense", "'=HYPERLINK(\"http://evil.test\",\"Snacks\")", "food", "Ana", "20.00", "USD", "10.00", "10.00", ""]);
    expect(rows[2]).toEqual(["2026-10-05", "Expense", "Books, paperback", "general", "Ben", "30.50", "USD", "15.25", "15.25", ""]);

    // Not a member: 404. Signed out: 401.
    const outsider = await signedIn(browser, chloe);
    expect((await outsider.request.get(`/api/groups/${groupId}/export`)).status()).toBe(404);
    await outsider.context().close();
    const anon = await browser.newContext();
    expect((await anon.request.get(`/api/groups/${groupId}/export`)).status()).toBe(401);
    await anon.close();
  });
});
