import { beforeAll, describe, expect, it } from "vitest";
import { getDashboard, listActivity } from "@/lib/server/activity";
import { db } from "@/lib/server/db";
import { createExpense, deleteExpense, getExpense, updateExpense } from "@/lib/server/expenses";
import { addFriendByEmail, getFriend, listFriends, removeFriend } from "@/lib/server/friends";
import { addMemberByEmail, createGroup, deleteGroup, getGroup, listGroups, removeMember, updateGroup } from "@/lib/server/groups";
import { deletePayment, recordPayment } from "@/lib/server/payments";
import { authenticate, changePassword, registerUser, updateProfile } from "@/lib/server/users";

const today = "2026-11-12";
let n = 0;
/** A signed-up user who has confirmed their email (only confirmed accounts can be added by email). */
async function user(name: string) {
  n += 1;
  const u = await registerUser({ name, email: `${name.toLowerCase()}.${n}@test.dev`, password: "password123" }, { ip: `192.0.2.${n % 250}` });
  await db.user.update({ where: { id: u.id }, data: { emailVerified: true } });
  return u;
}

describe("accounts", () => {
  it("registers, normalizes email and authenticates", async () => {
    const u = await registerUser({ name: "Ana", email: "  Ana.Case@Test.dev ", password: "password123" });
    expect(u.email).toBe("ana.case@test.dev");
    await expect(authenticate({ email: "ana.case@test.dev", password: "password123" })).resolves.toMatchObject({ id: u.id });
    await expect(authenticate({ email: "ana.case@test.dev", password: "nope-nope" })).rejects.toThrow("don't match");
    await expect(registerUser({ name: "Dup", email: "ana.case@test.dev", password: "password123" })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects short passwords with a field error", async () => {
    await expect(registerUser({ name: "X", email: "x@test.dev", password: "short" })).rejects.toMatchObject({
      fieldErrors: { password: "Use at least 8 characters." },
    });
  });

  it("changing password bumps the session version and requires the current password", async () => {
    const u = await user("Pat");
    await expect(changePassword(u.id, { currentPassword: "wrong", newPassword: "newpassword1" })).rejects.toThrow();
    const updated = await changePassword(u.id, { currentPassword: "password123", newPassword: "newpassword1" });
    expect(updated.sessionVersion).toBe(u.sessionVersion + 1);
    await expect(authenticate({ email: u.email, password: "newpassword1" })).resolves.toBeTruthy();
  });

  it("updates profile", async () => {
    const u = await user("Pro");
    await expect(updateProfile(u.id, { name: "Pro Name", defaultCurrency: "EUR" })).resolves.toMatchObject({ defaultCurrency: "EUR" });
    await expect(updateProfile(u.id, { name: "", defaultCurrency: "EUR" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("group ledger", () => {
  let ana: Awaited<ReturnType<typeof user>>, ben: typeof ana, cy: typeof ana, outsider: typeof ana;
  let groupId: string;

  beforeAll(async () => {
    [ana, ben, cy, outsider] = await Promise.all([user("Ana"), user("Ben"), user("Cy"), user("Out")]);
    groupId = (await createGroup(ana.id, { name: "Lisbon trip" })).id;
    await addMemberByEmail(ana.id, groupId, { email: ben.email });
    await addMemberByEmail(ana.id, groupId, { email: cy.email.toUpperCase() });
  });

  it("guards membership", async () => {
    await expect(getGroup(outsider.id, groupId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addMemberByEmail(ana.id, groupId, { email: "nobody@test.dev" })).rejects.toMatchObject({ fieldErrors: { name: expect.any(String) } });
    await expect(addMemberByEmail(ana.id, groupId, { email: ben.email })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      createExpense(outsider.id, { groupId, description: "x", amountCents: 100, paidById: outsider.id, date: today, split: { method: "equal", entries: [{ userId: outsider.id }] } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("adding a member makes them friends with the adder", async () => {
    const friends = await listFriends(ana.id);
    expect(friends.map((f) => f.id).sort()).toEqual([ben.id, cy.id].sort());
  });

  it("records expenses paid by anyone and derives balances + a simplified plan", async () => {
    // Ben pays $90 dinner split 3 ways; Cy pays $30 taxi for Ana & Cy (exact)
    await createExpense(ana.id, {
      groupId, description: "Dinner", amountCents: 9000, paidById: ben.id, date: today,
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }, { userId: cy.id }] },
    });
    await createExpense(ana.id, {
      groupId, description: "Taxi", amountCents: 3000, paidById: cy.id, date: today, category: "transport",
      split: { method: "exact", entries: [{ userId: ana.id, value: 2000 }, { userId: cy.id, value: 1000 }] },
    });
    const g = await getGroup(ana.id, groupId);
    const net = Object.fromEntries(g.members.map((m) => [m.name, m.netCents]));
    expect(net).toEqual({ Ana: -5000, Ben: 6000, Cy: -1000 });
    expect(g.members.reduce((s, m) => s + m.netCents, 0)).toBe(0);
    expect(g.plan.map((t) => [t.from.name, t.to.name, t.amountCents])).toEqual([["Ana", "Ben", 5000], ["Cy", "Ben", 1000]]);
    expect(g.expenses.find((e) => e.description === "Taxi")?.myStakeCents).toBe(-2000);
    expect((await listGroups(ana.id))[0]).toMatchObject({ id: groupId, myNetCents: -5000, memberCount: 3 });
  });

  it("rejects invalid splits", async () => {
    const base = { groupId, description: "Bad", amountCents: 1000, paidById: ana.id, date: today };
    await expect(createExpense(ana.id, { ...base, split: { method: "exact", entries: [{ userId: ana.id, value: 400 }, { userId: ben.id, value: 400 }] } })).rejects.toThrow("still unassigned");
    await expect(createExpense(ana.id, { ...base, paidById: outsider.id, split: { method: "equal", entries: [{ userId: ana.id }] } })).rejects.toMatchObject({ fieldErrors: { paidById: expect.any(String) } });
    await expect(createExpense(ana.id, { ...base, split: { method: "equal", entries: [{ userId: outsider.id }] } })).rejects.toThrow("must be in this group");
    await expect(createExpense(ana.id, { ...base, split: { method: "equal", entries: [{ userId: ana.id }] } })).rejects.toThrow("nobody owes anything");
  });

  it("partial payments reduce balances; members with balances can't be removed", async () => {
    await expect(removeMember(ana.id, groupId, cy.id)).rejects.toThrow("unsettled balance");
    const p = await recordPayment(ana.id, { groupId, fromUserId: ana.id, toUserId: ben.id, amountCents: 2000 });
    let g = await getGroup(ana.id, groupId);
    expect(g.myNetCents).toBe(-3000);
    await recordPayment(cy.id, { groupId, fromUserId: cy.id, toUserId: ben.id, amountCents: 1000, note: "venmo" });
    await expect(removeMember(ana.id, groupId, cy.id)).resolves.toEqual({ left: false, inviteLinkReset: true });
    await expect(recordPayment(ana.id, { groupId, fromUserId: ana.id, toUserId: outsider.id, amountCents: 100 })).rejects.toThrow("members");
    await deletePayment(ben.id, p.id);
    g = await getGroup(ana.id, groupId);
    expect(g.myNetCents).toBe(-5000);
    expect(g.members.map((m) => m.name)).toEqual(["Ana", "Ben"]);
  });

  it("edits and deletes expenses with access checks", async () => {
    const e = await createExpense(ben.id, {
      groupId, description: "Museum", amountCents: 4000, paidById: ben.id, date: today,
      split: { method: "shares", entries: [{ userId: ana.id, value: 1 }, { userId: ben.id, value: 3 }] },
    });
    const detail = await getExpense(ana.id, e.id);
    expect(detail.shares.map((s) => s.amountCents).sort()).toEqual([1000, 3000]);
    await expect(getExpense(outsider.id, e.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateExpense(outsider.id, e.id, {})).rejects.toMatchObject({ code: "NOT_FOUND" });
    await updateExpense(ana.id, e.id, {
      groupId, description: "Museum tickets", amountCents: 5000, paidById: ana.id, date: "2026-11-10",
      split: { method: "percentage", entries: [{ userId: ana.id, value: 50 }, { userId: ben.id, value: 50 }] },
    });
    const after = await getExpense(ben.id, e.id);
    expect(after).toMatchObject({ description: "Museum tickets", date: "2026-11-10", splitMethod: "percentage", paidBy: { id: ana.id } });
    await deleteExpense(ben.id, e.id);
    await expect(getExpense(ana.id, e.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("renames and only lets admins delete", async () => {
    await updateGroup(ben.id, groupId, { name: "Lisbon 2026" });
    expect((await getGroup(ana.id, groupId)).name).toBe("Lisbon 2026");
    await expect(deleteGroup(ben.id, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("friends, direct expenses, dashboard, activity", () => {
  it("combines group and direct balances per person", async () => {
    const [me, maya, stranger] = await Promise.all([user("Me"), user("Maya"), user("Stranger")]);
    await expect(addFriendByEmail(me.id, { email: me.email })).rejects.toThrow("your own email");
    await addFriendByEmail(me.id, { email: maya.email });
    await expect(addFriendByEmail(maya.id, { email: me.email })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      createExpense(me.id, { friendId: stranger.id, description: "x", amountCents: 100, paidById: me.id, date: today, split: { method: "equal", entries: [{ userId: me.id }, { userId: stranger.id }] } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Direct: I paid $50 groceries, Maya owes all of it.
    await createExpense(me.id, {
      friendId: maya.id, description: "Groceries", amountCents: 5000, paidById: me.id, date: today,
      split: { method: "exact", entries: [{ userId: me.id, value: 0 }, { userId: maya.id, value: 5000 }] },
    });
    // Group: Maya paid $30, split equally → I owe Maya $15.
    const g = await createGroup(me.id, { name: "Flat" });
    await addMemberByEmail(me.id, g.id, { email: maya.email });
    await createExpense(maya.id, {
      groupId: g.id, description: "Internet", amountCents: 3000, paidById: maya.id, date: today,
      split: { method: "equal", entries: [{ userId: me.id }, { userId: maya.id }] },
    });

    const detail = await getFriend(me.id, maya.id);
    expect(detail.balances).toEqual([{ currency: "USD", cents: 3500 }]);
    expect(detail.breakdown.map((b) => [b.context.kind, b.cents]).sort()).toEqual([["direct", 5000], ["group", -1500]]);
    expect(detail.expenses.map((e) => e.description).sort()).toEqual(["Groceries", "Internet"]);
    await expect(getFriend(stranger.id, maya.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const dash = await getDashboard(me.id);
    expect(dash.totals).toEqual([{ currency: "USD", owedToMeCents: 3500, iOweCents: 0, netCents: 3500 }]);
    expect((await getDashboard(maya.id)).totals).toEqual([{ currency: "USD", owedToMeCents: 0, iOweCents: 3500, netCents: -3500 }]);

    await expect(removeFriend(me.id, maya.id)).rejects.toThrow("Settle up");
    await expect(recordPayment(me.id, { friendId: maya.id, fromUserId: stranger.id, toUserId: me.id, amountCents: 100 })).rejects.toThrow();
    await recordPayment(maya.id, { friendId: me.id, fromUserId: maya.id, toUserId: me.id, amountCents: 5000 });
    expect((await getFriend(me.id, maya.id)).balances).toEqual([{ currency: "USD", cents: -1500 }]);

    const activity = await listActivity(me.id);
    expect(activity.map((a) => a.type)).toEqual(["payment", "expense", "expense"]);
    expect(await listActivity(stranger.id)).toEqual([]);

    await removeFriend(me.id, maya.id);
    expect(await listFriends(me.id)).toEqual([]);
  });
});

describe("currencies", () => {
  it("never adds balances in different currencies together", async () => {
    const [me, ben, maya] = await Promise.all([user("Cur"), user("Ben"), user("Maya")]);
    // A EUR trip: I paid €90 split with Ben, so Ben owes me €45.
    const trip = await createGroup(me.id, { name: "Lisbon", currency: "EUR" });
    await addMemberByEmail(me.id, trip.id, { email: ben.email });
    await createExpense(me.id, {
      groupId: trip.id, description: "Hotel", amountCents: 9000, paidById: me.id, date: today,
      split: { method: "equal", entries: [{ userId: me.id }, { userId: ben.id }] },
    });
    // A USD direct expense: Maya paid $20 split with me, so I owe Maya $10.
    await addFriendByEmail(me.id, { email: maya.email });
    await createExpense(maya.id, {
      friendId: me.id, description: "Lunch", amountCents: 2000, paidById: maya.id, date: today,
      split: { method: "equal", entries: [{ userId: me.id }, { userId: maya.id }] },
    });

    const dash = await getDashboard(me.id);
    expect(dash.totals).toEqual([
      { currency: "USD", owedToMeCents: 0, iOweCents: 1000, netCents: -1000 },
      { currency: "EUR", owedToMeCents: 4500, iOweCents: 0, netCents: 4500 },
    ]);
    expect(dash.people.map((p) => [p.user.name, p.currency, p.cents])).toEqual([
      ["Ben", "EUR", 4500],
      ["Maya", "USD", -1000],
    ]);
    expect((await listFriends(me.id)).find((f) => f.id === ben.id)?.balances).toEqual([{ currency: "EUR", cents: 4500 }]);

    // Direct balances keep the currency they were recorded in, even after a default-currency change.
    await updateProfile(me.id, { name: "Cur", defaultCurrency: "GBP" });
    const maya1 = await getFriend(me.id, maya.id);
    expect(maya1.balances).toEqual([{ currency: "USD", cents: -1000 }]);
    expect(maya1.breakdown).toEqual([{ context: { kind: "direct", currency: "USD" }, cents: -1000 }]);

    // Settling the USD balance from a GBP-default account records a USD payment that clears it.
    await recordPayment(me.id, { friendId: maya.id, fromUserId: me.id, toUserId: maya.id, amountCents: 1000, currency: "USD" });
    expect((await getFriend(me.id, maya.id)).balances).toEqual([]);
    await removeFriend(me.id, maya.id);
  });

  it("blocks removing a friend while any direct currency is unsettled", async () => {
    const [me, maya] = await Promise.all([user("Rem"), user("Maya")]);
    await addFriendByEmail(me.id, { email: maya.email });
    await createExpense(me.id, {
      friendId: maya.id, description: "Tickets", amountCents: 3000, paidById: me.id, date: today,
      split: { method: "equal", entries: [{ userId: me.id }, { userId: maya.id }] },
    });
    // A payment in another currency must not cancel it out.
    await recordPayment(maya.id, { friendId: me.id, fromUserId: maya.id, toUserId: me.id, amountCents: 1500, currency: "EUR" });
    await expect(removeFriend(me.id, maya.id)).rejects.toThrow("Settle up");
  });
});

describe("review fixes", () => {
  it("editing an expense keeps the shares of people who have left the group, and can't change them", async () => {
    const [a, b, c] = await Promise.all([user("Ann"), user("Bo"), user("Cat")]);
    const g = await createGroup(a.id, { name: "Cabin" });
    await addMemberByEmail(a.id, g.id, { email: b.email });
    await addMemberByEmail(a.id, g.id, { email: c.email });
    const all = [{ userId: a.id }, { userId: b.id }, { userId: c.id }];
    const e = await createExpense(a.id, { groupId: g.id, description: "Grocerys", amountCents: 9000, paidById: a.id, date: today, split: { method: "equal", entries: all } });
    // Cat settles up and leaves.
    await recordPayment(c.id, { groupId: g.id, fromUserId: c.id, toUserId: a.id, amountCents: 3000 });
    await removeMember(c.id, g.id, c.id);

    // Fixing a typo keeps Cat's share, so nobody's balance moves.
    await updateExpense(a.id, e.id, { groupId: g.id, description: "Groceries", amountCents: 9000, paidById: a.id, date: today, split: { method: "equal", entries: all } });
    let detail = await getGroup(a.id, g.id);
    expect(detail.myNetCents).toBe(3000);
    expect((await getExpense(a.id, e.id)).shares.map((s) => s.amountCents)).toEqual([3000, 3000, 3000]);

    // Dropping Cat, or changing the amount, would move a balance nobody can settle any more.
    await expect(
      updateExpense(a.id, e.id, { groupId: g.id, description: "Groceries", amountCents: 9000, paidById: a.id, date: today, split: { method: "equal", entries: all.slice(0, 2) } }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { split: expect.any(String) } });
    await expect(
      updateExpense(a.id, e.id, { groupId: g.id, description: "Groceries", amountCents: 12000, paidById: a.id, date: today, split: { method: "equal", entries: all } }),
    ).rejects.toThrow("left the group");
    // An exact split that keeps Cat's amount can still move money between current members.
    await updateExpense(a.id, e.id, {
      groupId: g.id, description: "Groceries", amountCents: 9000, paidById: a.id, date: today,
      split: { method: "exact", entries: [{ userId: a.id, value: 2000 }, { userId: b.id, value: 4000 }, { userId: c.id, value: 3000 }] },
    });
    detail = await getGroup(a.id, g.id);
    expect(detail.myNetCents).toBe(4000);
    expect(detail.plan.every((t) => t.from.id !== c.id && t.to.id !== c.id)).toBe(true);
  });

  it("an expense whose payer has left can be edited only in ways that keep the payer's balance", async () => {
    const [a, b] = await Promise.all([user("Ann"), user("Bo")]);
    const g = await createGroup(a.id, { name: "Flatshare" });
    await addMemberByEmail(a.id, g.id, { email: b.email });
    const split = { method: "equal" as const, entries: [{ userId: a.id }, { userId: b.id }] };
    const e = await createExpense(b.id, { groupId: g.id, description: "Rent", amountCents: 6000, paidById: b.id, date: today, split });
    await recordPayment(a.id, { groupId: g.id, fromUserId: a.id, toUserId: b.id, amountCents: 3000 });
    await removeMember(b.id, g.id, b.id);

    await updateExpense(a.id, e.id, { groupId: g.id, description: "Rent (March)", amountCents: 6000, paidById: b.id, date: today, split, category: "housing" });
    expect((await getExpense(a.id, e.id)).description).toBe("Rent (March)");
    await expect(
      updateExpense(a.id, e.id, { groupId: g.id, description: "Rent", amountCents: 6000, paidById: a.id, date: today, split }),
    ).rejects.toThrow("The person who paid has left this group");
  });

  it("locks a group's currency once anything is recorded", async () => {
    const [a, b] = await Promise.all([user("Ann"), user("Bo")]);
    const g = await createGroup(a.id, { name: "Trip", currency: "USD" });
    await expect(updateGroup(a.id, g.id, { name: "Trip", currency: "EUR" })).resolves.toMatchObject({ currency: "EUR" });
    expect((await getGroup(a.id, g.id)).currencyLocked).toBe(false);
    await addMemberByEmail(a.id, g.id, { email: b.email });
    await createExpense(a.id, { groupId: g.id, description: "Bus", amountCents: 1000, paidById: a.id, date: today, split: { method: "equal", entries: [{ userId: a.id }, { userId: b.id }] } });
    expect((await getGroup(a.id, g.id)).currencyLocked).toBe(true);
    await expect(updateGroup(b.id, g.id, { name: "Trip", currency: "INR" })).rejects.toMatchObject({
      code: "CONFLICT",
      fieldErrors: { currency: expect.stringContaining("can't change") },
    });
    // Renaming (sending the same currency back) is still fine.
    await expect(updateGroup(b.id, g.id, { name: "Big trip", currency: "EUR" })).resolves.toMatchObject({ name: "Big trip", currency: "EUR" });
  });

  it("won't delete a group while anyone has an unsettled balance", async () => {
    const [a, b] = await Promise.all([user("Ann"), user("Bo")]);
    const g = await createGroup(a.id, { name: "Dinners" });
    await addMemberByEmail(a.id, g.id, { email: b.email });
    await createExpense(b.id, { groupId: g.id, description: "Pizza", amountCents: 2000, paidById: b.id, date: today, split: { method: "equal", entries: [{ userId: a.id }, { userId: b.id }] } });
    expect((await getGroup(a.id, g.id)).settled).toBe(false);
    await expect(deleteGroup(a.id, g.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await recordPayment(a.id, { groupId: g.id, fromUserId: a.id, toUserId: b.id, amountCents: 1000 });
    expect((await getGroup(a.id, g.id)).settled).toBe(true);
    await deleteGroup(a.id, g.id);
    await expect(getGroup(a.id, g.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("the friend page shows only what a group expense moves between the two of you", async () => {
    const [me, ben, chloe] = await Promise.all([user("Me"), user("Ben"), user("Chloe")]);
    const g = await createGroup(me.id, { name: "Dinner club" });
    await addMemberByEmail(me.id, g.id, { email: ben.email });
    await addMemberByEmail(me.id, g.id, { email: chloe.email });
    await createExpense(me.id, {
      groupId: g.id, description: "Dinner", amountCents: 9000, paidById: me.id, date: today,
      split: { method: "equal", entries: [{ userId: me.id }, { userId: ben.id }, { userId: chloe.id }] },
    });
    const withBen = await getFriend(me.id, ben.id);
    expect(withBen.expenses.find((e) => e.description === "Dinner")?.myStakeCents).toBe(3000);
    const benSide = await getFriend(ben.id, me.id);
    expect(benSide.expenses.find((e) => e.description === "Dinner")?.myStakeCents).toBe(-3000);
  });
});
