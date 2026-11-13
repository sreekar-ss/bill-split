import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { addComment, deleteComment, listComments, notifyCommentAdded } from "@/lib/server/comments";
import { db } from "@/lib/server/db";
import { createExpense } from "@/lib/server/expenses";
import { csvCell, exportGroupCsv } from "@/lib/server/export-csv";
import { addFriendByEmail } from "@/lib/server/friends";
import { addMemberByEmail, archiveGroup, createGroup, getExpenseContexts, listGroups, unarchiveGroup, updateGroup } from "@/lib/server/groups";
import { getGroupInsights, getPersonalInsights } from "@/lib/server/insights";
import { recordPayment } from "@/lib/server/payments";
import { savePushSubscription, sentPushes } from "@/lib/server/push";
import { searchExpenses } from "@/lib/server/search";
import { registerUser } from "@/lib/server/users";

let n = 0;
async function user(name: string) {
  n += 1;
  const u = await registerUser({ name, email: `${name.toLowerCase()}.v21.${n}@test.dev`, password: "password123" }, { ip: `198.18.0.${n % 250}` });
  await db.user.update({ where: { id: u.id }, data: { emailVerified: true } });
  return u;
}
async function pair(groupName = "Flat") {
  const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
  const g = await createGroup(ana.id, { name: groupName });
  await addMemberByEmail(ana.id, g.id, { email: ben.email });
  return { ana, ben, g };
}
const split = (...ids: string[]) => ({ method: "equal" as const, entries: ids.map((userId) => ({ userId })) });

beforeEach(() => {
  sentPushes.length = 0;
});

describe("offline-safe saves (clientId)", () => {
  it("re-sending the same expense never duplicates it, even concurrently", async () => {
    const { ana, ben, g } = await pair();
    const input = { clientId: randomUUID(), groupId: g.id, description: "Milk", amountCents: 400, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) };
    const first = await createExpense(ana.id, input);
    await expect(createExpense(ana.id, input)).resolves.toEqual(first);
    const racing = { ...input, clientId: randomUUID() };
    const [a, b] = await Promise.all([createExpense(ana.id, racing), createExpense(ana.id, racing)]);
    expect(a.id).toBe(b.id);
    expect(await db.expense.count({ where: { groupId: g.id } })).toBe(2);
    await expect(createExpense(ben.id, { ...input, paidById: ben.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("archiving and emoji", () => {
  it("archives only settled groups, which then become read-only and leave the add-expense list", async () => {
    const { ana, ben, g } = await pair("Lisbon");
    await expect(updateGroup(ana.id, g.id, { name: "Lisbon", icon: "🏖️" })).resolves.toMatchObject({ icon: "🏖️" });
    await expect(updateGroup(ana.id, g.id, { name: "Lisbon", icon: "ab" })).rejects.toMatchObject({ fieldErrors: { icon: expect.any(String) } });
    await createExpense(ana.id, { groupId: g.id, description: "Hotel", amountCents: 1000, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    await expect(archiveGroup(ben.id, g.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 500 });
    await archiveGroup(ben.id, g.id);

    expect((await listGroups(ana.id)).find((x) => x.id === g.id)).toMatchObject({ archived: true, icon: "🏖️" });
    expect((await getExpenseContexts(ana.id)).groups.map((x) => x.id)).not.toContain(g.id);
    await expect(
      createExpense(ana.id, { groupId: g.id, description: "Late", amountCents: 100, paidById: ana.id, date: "2026-11-11", split: split(ana.id, ben.id) }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(recordPayment(ana.id, { groupId: g.id, fromUserId: ana.id, toUserId: ben.id, amountCents: 1 })).rejects.toMatchObject({ code: "CONFLICT" });

    await unarchiveGroup(ana.id, g.id);
    await expect(
      createExpense(ana.id, { groupId: g.id, description: "Late", amountCents: 100, paidById: ana.id, date: "2026-11-11", split: split(ana.id, ben.id) }),
    ).resolves.toBeTruthy();
    await expect(updateGroup(ana.id, g.id, { name: "Lisbon", icon: "" })).resolves.toMatchObject({ icon: null });
  });
});

describe("comments", () => {
  it("only people who can see the expense can read or write; authors delete; others get a push", async () => {
    const { ana, ben, g } = await pair();
    const out = await user("Out");
    const e = await createExpense(ana.id, { groupId: g.id, description: "Dinner", amountCents: 6000, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    await savePushSubscription(ana.id, { endpoint: `https://push.test/c-ana-${n}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });
    await savePushSubscription(ben.id, { endpoint: `https://push.test/c-ben-${n}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });

    await expect(listComments(out.id, e.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addComment(out.id, e.id, { text: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addComment(ben.id, e.id, { text: "   " })).rejects.toMatchObject({ code: "VALIDATION" });
    const c = await addComment(ben.id, e.id, { text: "Was this Tuesday's dinner?" });
    await notifyCommentAdded(c.id);
    expect(sentPushes).toEqual([expect.objectContaining({ endpoint: `https://push.test/c-ana-${n}`, title: "Ben commented on Dinner", body: "Was this Tuesday's dinner?" })]);

    const list = await listComments(ana.id, e.id);
    expect(list.map((x) => [x.author.name, x.text, x.mine])).toEqual([["Ben", "Was this Tuesday's dinner?", false]]);
    await expect(deleteComment(ana.id, c.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteComment(ben.id, c.id);
    expect(await listComments(ana.id, e.id)).toEqual([]);
  });

  it("limits how fast someone can comment", async () => {
    const { ana, ben, g } = await pair();
    const e = await createExpense(ana.id, { groupId: g.id, description: "Snacks", amountCents: 100, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    for (let i = 0; i < 20; i++) await addComment(ana.id, e.id, { text: `#${i}` });
    await expect(addComment(ana.id, e.id, { text: "one more" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("search and filters", () => {
  it("finds visible expenses by text and filters, never other people's", async () => {
    const { ana, ben, g } = await pair();
    const maya = await user("Maya");
    await addFriendByEmail(ana.id, { email: maya.email });
    const add = (by: string, d: string, cents: number, date: string, category = "general", notes?: string, groupId: string | null = g.id) =>
      createExpense(by, {
        ...(groupId ? { groupId } : { friendId: by === ana.id ? maya.id : ana.id }),
        description: d, amountCents: cents, paidById: by, date, category, notes,
        split: groupId ? split(ana.id, ben.id) : split(ana.id, maya.id),
      });
    await add(ana.id, "Groceries Lidl", 4200, "2026-10-02", "groceries");
    await add(ben.id, "Internet", 3000, "2026-10-15", "utilities", "Fibre plan");
    await add(ana.id, "Cinema", 2400, "2026-11-01", "entertainment", undefined, null);
    const other = await pair("Secret");
    await createExpense(other.ana.id, { groupId: other.g.id, description: "Groceries hidden", amountCents: 999, paidById: other.ana.id, date: "2026-10-03", split: split(other.ana.id, other.ben.id) });

    const q = async (f: Record<string, unknown>) => (await searchExpenses(ana.id, f)).items.map((i) => i.description);
    expect(await q({ q: "groceries" })).toEqual(["Groceries Lidl"]);
    expect(await q({ q: "FIBRE" })).toEqual(["Internet"]); // notes, case-insensitive
    expect(await q({ category: "utilities" })).toEqual(["Internet"]);
    expect(await q({ paidBy: "me" })).toEqual(["Cinema", "Groceries Lidl"]);
    expect(await q({ paidBy: "others" })).toEqual(["Internet"]);
    expect(await q({ from: "2026-10-10", to: "2026-10-31" })).toEqual(["Internet"]);
    expect(await q({ minCents: 2500, maxCents: 3500 })).toEqual(["Internet"]);
    expect(await q({ groupId: g.id })).toEqual(["Internet", "Groceries Lidl"]);
    expect(await q({ friendId: maya.id })).toEqual(["Cinema"]);
    expect((await searchExpenses(ana.id, { q: "Cinema" })).items[0]).toMatchObject({ friend: { name: "Maya" }, myStakeCents: 1200 });
  });

  it("pages through results", async () => {
    const { ana, ben, g } = await pair();
    for (let i = 0; i < 32; i++) {
      await createExpense(ana.id, { groupId: g.id, description: `Item ${i}`, amountCents: 100 + i, paidById: ana.id, date: "2026-11-01", split: split(ana.id, ben.id) });
    }
    const p0 = await searchExpenses(ana.id, { groupId: g.id });
    const p1 = await searchExpenses(ana.id, { groupId: g.id, page: 1 });
    expect([p0.items.length, p0.hasMore, p1.items.length, p1.hasMore]).toEqual([30, true, 2, false]);
    expect(new Set([...p0.items, ...p1.items].map((i) => i.id)).size).toBe(32);
  });
});

describe("insights", () => {
  it("adds up your share by month and category, per currency, excluding payments", async () => {
    const { ana, ben, g } = await pair();
    const eur = await createGroup(ana.id, { name: "Paris", currency: "EUR" });
    await addMemberByEmail(ana.id, eur.id, { email: ben.email });
    await createExpense(ana.id, { groupId: g.id, description: "Rent", amountCents: 100000, paidById: ana.id, date: "2026-10-01", category: "housing", split: split(ana.id, ben.id) });
    await createExpense(ben.id, { groupId: g.id, description: "Food", amountCents: 3000, paidById: ben.id, date: "2026-11-05", category: "food", split: split(ana.id, ben.id) });
    await createExpense(ana.id, { groupId: eur.id, description: "Museum", amountCents: 4000, paidById: ana.id, date: "2026-11-06", category: "entertainment", split: split(ana.id, ben.id) });
    await createExpense(ana.id, { groupId: g.id, description: "Too old", amountCents: 5000, paidById: ana.id, date: "2026-01-01", split: split(ana.id, ben.id) });
    await recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 10000 });

    const p = await getPersonalInsights(ana.id, { months: 3, today: "2026-11-13" });
    expect(p.months).toEqual(["2026-09", "2026-10", "2026-11"]);
    const usd = p.currencies.find((c) => c.currency === "USD")!;
    expect(usd.totalCents).toBe(51500);
    expect(usd.monthly).toEqual([{ month: "2026-09", cents: 0 }, { month: "2026-10", cents: 50000 }, { month: "2026-11", cents: 1500 }]);
    expect(usd.byCategory).toEqual([{ category: "housing", cents: 50000 }, { category: "food", cents: 1500 }]);
    expect(p.currencies.find((c) => c.currency === "EUR")!.totalCents).toBe(2000);

    const gi = await getGroupInsights(ben.id, g.id, { months: 3, today: "2026-11-13" });
    expect(gi.totalCents).toBe(103000);
    expect(gi.byPerson.map((x) => [x.name, x.paidCents, x.shareCents])).toEqual([["Ana", 100000, 51500], ["You", 3000, 51500]]);
    await expect(getGroupInsights((await user("Out")).id, g.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas and quotes properly", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("12.50")).toBe("12.50");
  });

  it("exports a group's expenses and payments for members only", async () => {
    const { ana, ben, g } = await pair("Flat 3B");
    await createExpense(ana.id, { groupId: g.id, description: "=cmd|' /C calc'!A0", amountCents: 1001, paidById: ana.id, date: "2026-11-02", split: split(ana.id, ben.id) });
    await recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 500, date: "2026-11-03" });
    const { csv, filename } = await exportGroupCsv(ben.id, g.id);
    expect(filename).toMatch(/^flat-3b-billsplit-\d{4}-\d{2}-\d{2}\.csv$/);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("Date,Type,Description,Category,Paid by,Amount,Currency,Ana share,Ben share,Notes");
    expect(lines[1]).toBe("2026-11-02,Expense,'=cmd|' /C calc'!A0,general,Ana,10.01,USD,5.01,5.00,");
    expect(lines[2]).toBe("2026-11-03,Payment,Ben paid Ana,,Ben,5.00,USD,,,");
    await expect(exportGroupCsv((await user("Out")).id, g.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
