import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addComment } from "@/lib/server/comments";
import { db } from "@/lib/server/db";
import { DAILY_EMAIL_CAP, sendVerificationEmail } from "@/lib/server/email-tokens";
import { createExpense, deleteExpense } from "@/lib/server/expenses";
import { addMemberByEmail, archiveGroup, ARCHIVED_MESSAGE, createGroup, deleteGroup, removeMember } from "@/lib/server/groups";
import { ARCHIVED_INVITE, getInviteLink, getInvitePreview, joinGroupByInvite, resetInviteLink } from "@/lib/server/invites";
import { sentEmails } from "@/lib/server/mailer";
import { NOTIFY_PER_MINUTE, notifyExpenseCreated, notifyPaymentRecorded } from "@/lib/server/notifications";
import { deletePayment, recordPayment } from "@/lib/server/payments";
import { savePushSubscription, sentPushes } from "@/lib/server/push";
import { hit } from "@/lib/server/rate-limit";
import { createRecurringExpense, runDueRecurring, stopRecurring } from "@/lib/server/recurring";
import { registerUser } from "@/lib/server/users";
import { COMMENT_MAX } from "@/lib/validation";

// The Server Actions run here without Next: `after` callbacks are collected and awaited by the test,
// and the signed-in user is whoever `actingAs` points at.
const harness = vi.hoisted(() => ({
  pending: [] as Promise<unknown>[],
  actingAs: null as null | { id: string; email: string; name: string; defaultCurrency: string; emailVerified: boolean },
}));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void harness.pending.push(Promise.resolve().then(fn)) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => {
    if (!harness.actingAs) throw new Error("no user");
    return harness.actingAs;
  },
}));
const { createExpenseAction } = await import("@/app/actions/expenses");
const { recordPaymentAction } = await import("@/app/actions/payments");

async function flushAfter() {
  await Promise.all(harness.pending.splice(0));
}

let n = 0;
async function user(name: string, verified = true) {
  n += 1;
  const u = await registerUser({ name, email: `${name.toLowerCase()}.fixes.${n}@test.dev`, password: "password123" }, { ip: `100.64.${n % 250}.1` });
  if (verified) await db.user.update({ where: { id: u.id }, data: { emailVerified: true } });
  return u;
}
function actAs(u: { id: string; email: string; name: string }) {
  harness.actingAs = { id: u.id, email: u.email, name: u.name, defaultCurrency: "USD", emailVerified: true };
}
const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
const split = (...ids: string[]) => ({ method: "equal" as const, entries: ids.map((userId) => ({ userId })) });

beforeEach(() => {
  sentPushes.length = 0;
  sentEmails.length = 0;
  harness.pending.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("history with people who have left", () => {
  it("won't delete an expense or payment that would change a former member's balance", async () => {
    const [ana, ben, cy] = await Promise.all([user("Ana"), user("Ben"), user("Cy")]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await addMemberByEmail(ana.id, g.id, { email: cy.email });
    const dinner = await createExpense(ana.id, { groupId: g.id, description: "Dinner", amountCents: 3000, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id, cy.id) });
    const cyPaid = await recordPayment(cy.id, { groupId: g.id, fromUserId: cy.id, toUserId: ana.id, amountCents: 1000 });
    const milk = await createExpense(ana.id, { groupId: g.id, description: "Milk", amountCents: 400, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    const benPaid = await recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 200 });
    await removeMember(cy.id, g.id, cy.id); // settled, so Cy can leave

    const left = { code: "CONFLICT", message: expect.stringContaining("has left the group") };
    await expect(deleteExpense(ana.id, dinner.id)).rejects.toMatchObject(left);
    await expect(deletePayment(ana.id, cyPaid.id)).rejects.toMatchObject(left);
    // Things only current members are on can still go.
    await expect(deleteExpense(ana.id, milk.id)).resolves.toMatchObject({ groupId: g.id });
    await expect(deletePayment(ana.id, benPaid.id)).resolves.toMatchObject({ groupId: g.id });
    expect(await db.expense.count({ where: { id: dinner.id } })).toBe(1);
    expect(await db.settlement.count({ where: { id: cyPaid.id } })).toBe(1);
  });
});

describe("account emails", () => {
  it("sends at most the daily cap of verification links, whatever the cooldown", async () => {
    const u = await user("Vic", false); // sign-up sent the first link
    const cap = DAILY_EMAIL_CAP.verify_email;
    const pastCooldown = () => db.emailToken.updateMany({ where: { userId: u.id }, data: { createdAt: new Date(Date.now() - 120_000) } });
    for (let i = 1; i < cap; i++) {
      await pastCooldown();
      expect(await sendVerificationEmail(u.id)).toBe(true);
    }
    await pastCooldown();
    expect(await sendVerificationEmail(u.id)).toBe(false);
    expect(sentEmails.filter((m) => m.to === u.email)).toHaveLength(cap); // including the sign-up email
    // A day later the cap starts over.
    await db.emailToken.updateMany({ where: { userId: u.id }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    expect(await sendVerificationEmail(u.id)).toBe(true);
  });
});

describe("archived groups", () => {
  it("can't gain members by email or invite link, and the join page knows why", async () => {
    const [ana, ben, cy] = await Promise.all([user("Ana"), user("Ben"), user("Cy")]);
    const g = await createGroup(ana.id, { name: "Old trip" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    const token = (await getInviteLink(ana.id, g.id)).url.split("/join/")[1];
    expect(await getInvitePreview(token, cy.id)).toMatchObject({ archived: false });
    await archiveGroup(ana.id, g.id);

    await expect(addMemberByEmail(ana.id, g.id, { email: cy.email })).rejects.toMatchObject({ code: "CONFLICT", message: ARCHIVED_MESSAGE });
    await expect(resetInviteLink(ana.id, g.id)).rejects.toMatchObject({ code: "CONFLICT", message: ARCHIVED_MESSAGE });
    await expect(resetInviteLink(ben.id, g.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the group's admin can reset the invite link." });
    expect(await getInvitePreview(token, cy.id)).toMatchObject({ archived: true, alreadyMember: false });
    await expect(joinGroupByInvite(cy.id, token)).rejects.toMatchObject({ code: "CONFLICT", message: ARCHIVED_INVITE });
    await expect(joinGroupByInvite(ben.id, token)).resolves.toEqual({ groupId: g.id, joined: false });
    expect(await db.groupMember.count({ where: { groupId: g.id } })).toBe(2);
  });

  it("uses the same message everywhere a change is refused", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Done" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    const e = await createExpense(ana.id, { groupId: g.id, description: "Taxi", amountCents: 1000, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    const p = await recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 500 });
    await archiveGroup(ana.id, g.id);
    const archived = { code: "CONFLICT", message: ARCHIVED_MESSAGE };
    const input = { groupId: g.id, description: "More", amountCents: 100, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) };
    await expect(createExpense(ana.id, input)).rejects.toMatchObject(archived);
    await expect(deleteExpense(ana.id, e.id)).rejects.toMatchObject(archived);
    await expect(recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 1 })).rejects.toMatchObject(archived);
    await expect(deletePayment(ben.id, p.id)).rejects.toMatchObject(archived);
    await expect(addComment(ben.id, e.id, { text: "Thanks" })).rejects.toMatchObject(archived);
  });
});

describe("admin-only group actions", () => {
  it("keep their messages for members who aren't the admin", async () => {
    const [ana, ben, cy, out] = await Promise.all([user("Ana"), user("Ben"), user("Cy"), user("Out")]);
    const g = await createGroup(ana.id, { name: "Club" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await addMemberByEmail(ana.id, g.id, { email: cy.email });
    await expect(removeMember(ben.id, g.id, cy.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the group's admin can remove other members." });
    await expect(deleteGroup(ben.id, g.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "Only the group's admin can delete it." });
    await expect(deleteGroup(out.id, g.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeMember(ben.id, g.id, ben.id)).resolves.toMatchObject({ left: true });
    await expect(removeMember(ana.id, g.id, cy.id)).resolves.toMatchObject({ left: false, inviteLinkReset: true });
    await deleteGroup(ana.id, g.id);
    expect(await db.group.count({ where: { id: g.id } })).toBe(0);
  });
});

describe("comments", () => {
  it(`are limited to ${COMMENT_MAX} characters`, async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Chat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    const e = await createExpense(ana.id, { groupId: g.id, description: "Pizza", amountCents: 1000, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    await expect(addComment(ana.id, e.id, { text: "x".repeat(COMMENT_MAX) })).resolves.toMatchObject({ id: expect.any(String) });
    await expect(addComment(ana.id, e.id, { text: "x".repeat(COMMENT_MAX + 1) })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { text: `Keep comments under ${COMMENT_MAX} characters.` },
    });
  });
});

describe("notifications", () => {
  it("never throw, so a failing push can't pause a healthy recurring schedule", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Rent" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    // Dates long before every other test's schedules, so this run only picks up this one.
    const { recurringId } = await createRecurringExpense(
      ana.id,
      { groupId: g.id, description: "Rent", amountCents: 9000, paidById: ana.id, date: "2020-01-06", split: split(ana.id, ben.id) },
      { frequency: "weekly" },
      "2020-01-06",
    );
    const p = await recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 100 });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db.expense, "findUnique").mockRejectedValue(new Error("database hiccup"));
    vi.spyOn(db.settlement, "findUnique").mockRejectedValue(new Error("database hiccup"));
    await expect(notifyExpenseCreated("missing", ana.id)).resolves.toBeUndefined();
    await expect(notifyPaymentRecorded(p.id, ben.id)).resolves.toBeUndefined();

    await expect(runDueRecurring("2020-01-13")).resolves.toMatchObject({ created: 1, paused: 0 });
    expect(error).toHaveBeenCalled();
    vi.restoreAllMocks();
    const r = await db.recurringExpense.findUniqueOrThrow({ where: { id: recurringId } });
    expect(r.pausedAt).toBeNull();
    expect(r.lastError).toBeNull();
    expect(r.nextRunOn.toISOString().slice(0, 10)).toBe("2020-01-20");
    await stopRecurring(ana.id, recurringId);
  });

  it("are pushed once for an expense, however many times the same save is re-sent", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await savePushSubscription(ben.id, { endpoint: `https://push.test/fixes-ben-${n}`, keys });
    actAs(ana);

    const input = { clientId: randomUUID(), groupId: g.id, description: "Milk", amountCents: 400, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) };
    const first = await createExpenseAction(input);
    const again = await createExpenseAction(input);
    await flushAfter();
    expect(first).toEqual({ ok: true, data: { id: expect.any(String), recurringId: undefined } });
    expect(again).toEqual(first);
    expect(sentPushes.filter((x) => x.title === "Ana added Milk")).toHaveLength(1);

    const repeating = { ...input, clientId: randomUUID(), description: "Water" };
    const r1 = await createExpenseAction(repeating, { frequency: "weekly" });
    const r2 = await createExpenseAction(repeating, { frequency: "weekly" });
    await flushAfter();
    expect(r2).toEqual(r1);
    expect(sentPushes.filter((x) => x.title === "Ana added Water")).toHaveLength(1);
    if (r1.ok && r1.data.recurringId) await stopRecurring(ana.id, r1.data.recurringId);
  });

  it(`stop after ${NOTIFY_PER_MINUTE} a minute per person, but every save still goes through`, async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Busy" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await savePushSubscription(ben.id, { endpoint: `https://push.test/fixes-busy-${n}`, keys });
    await savePushSubscription(ana.id, { endpoint: `https://push.test/fixes-ana-${n}`, keys });
    actAs(ana);

    for (let i = 1; i < NOTIFY_PER_MINUTE; i++) await hit(`notify:${ana.id}`, 60_000);
    const last = await createExpenseAction({ groupId: g.id, description: "Last one", amountCents: 400, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    const over = await createExpenseAction({ groupId: g.id, description: "One too many", amountCents: 400, paidById: ana.id, date: "2026-11-10", split: split(ana.id, ben.id) });
    const paid = await recordPaymentAction({ groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 100 });
    await flushAfter();
    expect([last.ok, over.ok, paid.ok]).toEqual([true, true, true]);
    expect(await db.expense.count({ where: { groupId: g.id } })).toBe(2);
    expect(await db.settlement.count({ where: { groupId: g.id } })).toBe(1);
    expect(sentPushes.map((x) => x.title)).toEqual(["Ana added Last one"]);
  });
});
