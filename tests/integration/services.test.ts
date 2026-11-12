import { beforeAll, describe, expect, it } from "vitest";
import { getDashboard, listActivity } from "@/lib/server/activity";
import { createExpense, deleteExpense, getExpense, updateExpense } from "@/lib/server/expenses";
import { addFriendByEmail, getFriend, listFriends, removeFriend } from "@/lib/server/friends";
import { addMemberByEmail, createGroup, deleteGroup, getGroup, listGroups, removeMember, updateGroup } from "@/lib/server/groups";
import { deletePayment, recordPayment } from "@/lib/server/payments";
import { authenticate, changePassword, registerUser, updateProfile } from "@/lib/server/users";

const today = "2026-11-12";
let n = 0;
async function user(name: string) {
  n += 1;
  return registerUser({ name, email: `${name.toLowerCase()}.${n}@test.dev`, password: "password123" });
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
    await expect(addMemberByEmail(ana.id, groupId, { email: "nobody@test.dev" })).rejects.toThrow("doesn't have a BillSplit account");
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
    await expect(removeMember(ana.id, groupId, cy.id)).resolves.toEqual({ left: false });
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
    expect(detail.netCents).toBe(3500);
    expect(detail.breakdown.map((b) => [b.context.kind, b.cents]).sort()).toEqual([["direct", 5000], ["group", -1500]]);
    expect(detail.expenses.map((e) => e.description).sort()).toEqual(["Groceries", "Internet"]);
    await expect(getFriend(stranger.id, maya.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const dash = await getDashboard(me.id);
    expect(dash).toMatchObject({ owedToMeCents: 3500, iOweCents: 0, netCents: 3500 });
    expect((await getDashboard(maya.id)).iOweCents).toBe(3500);

    await expect(removeFriend(me.id, maya.id)).rejects.toThrow("Settle up");
    await expect(recordPayment(me.id, { friendId: maya.id, fromUserId: stranger.id, toUserId: me.id, amountCents: 100 })).rejects.toThrow();
    await recordPayment(maya.id, { friendId: me.id, fromUserId: maya.id, toUserId: me.id, amountCents: 5000 });
    expect((await getFriend(me.id, maya.id)).netCents).toBe(-1500);

    const activity = await listActivity(me.id);
    expect(activity.map((a) => a.type)).toEqual(["payment", "expense", "expense"]);
    expect(await listActivity(stranger.id)).toEqual([]);

    await removeFriend(me.id, maya.id);
    expect(await listFriends(me.id)).toEqual([]);
  });
});
