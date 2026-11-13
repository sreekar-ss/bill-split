import { beforeEach, describe, expect, it } from "vitest";
import { updatePaymentHandles } from "@/lib/server/account";
import { db } from "@/lib/server/db";
import { createExpense } from "@/lib/server/expenses";
import { addFriendByEmail, removeFriend } from "@/lib/server/friends";
import { addMemberByEmail, createGroup } from "@/lib/server/groups";
import { sentEmails } from "@/lib/server/mailer";
import { savePushSubscription, sentPushes } from "@/lib/server/push";
import {
  notifyExpenseCreated, notifyPaymentRecorded, sendReminder, sendWeeklyDigests, unsubscribe, unsubscribeUrl, updateNotificationPrefs,
} from "@/lib/server/notifications";
import { recordPayment } from "@/lib/server/payments";
import { createRecurringExpense, listRecurring, pauseRecurring, resumeRecurring, runDueRecurring, stopRecurring } from "@/lib/server/recurring";
import { registerUser } from "@/lib/server/users";

let n = 0;
async function user(name: string, verified = true) {
  n += 1;
  // Each sign-up from its own documentation-range IP (sign-ups are throttled per IP).
  const u = await registerUser({ name, email: `${name.toLowerCase()}.v2b.${n}@test.dev`, password: "password123" }, { ip: `198.51.100.${n % 250}` });
  if (verified) await db.user.update({ where: { id: u.id }, data: { emailVerified: true } });
  return u;
}
const mailsTo = (email: string) => sentEmails.filter((m) => m.to === email);

const device = (u: { id: string }) =>
  savePushSubscription(u.id, { endpoint: `https://push.test/v2b-${u.id}`, keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } });
const pushesTo = (u: { id: string }) => sentPushes.filter((p) => p.endpoint === `https://push.test/v2b-${u.id}`);

beforeEach(() => {
  sentPushes.length = 0;
  sentEmails.length = 0;
});

describe("expense & payment notifications", () => {
  it("expenses and payments notify by push only (no email), respecting preferences, never the actor", async () => {
    const [ana, ben, cy, dee] = await Promise.all([user("Ana"), user("Ben"), user("Cy", false), user("Dee")]);
    const g = await createGroup(ana.id, { name: "Lisbon" });
    for (const u of [ben, cy, dee]) await addMemberByEmail(ana.id, g.id, { email: u.email }).catch(async () => {
      // unconfirmed accounts can't be added by email; add directly for this test
      await db.groupMember.create({ data: { groupId: g.id, userId: u.id } });
    });
    for (const u of [ana, ben, cy, dee]) await device(u);
    await updateNotificationPrefs(dee.id, { notifyExpenses: false });
    sentEmails.length = 0;

    const e = await createExpense(ana.id, {
      groupId: g.id, description: "Dinner", amountCents: 8000, paidById: ana.id, date: "2026-11-13",
      split: { method: "equal", entries: [ana, ben, cy, dee].map((u) => ({ userId: u.id })) },
    });
    await notifyExpenseCreated(e.id, ana.id);
    expect(sentEmails).toHaveLength(0); // email budget: everyday updates never email
    expect(pushesTo(ana)).toHaveLength(0); // the actor
    expect(pushesTo(dee)).toHaveLength(0); // turned expenses off
    expect(pushesTo(ben)).toEqual([expect.objectContaining({ title: "Ana added Dinner", body: "You owe $20.00. In Lisbon." })]);
    expect(pushesTo(cy)).toHaveLength(1); // push doesn't need a confirmed email

    sentPushes.length = 0;
    const p = await recordPayment(ben.id, { groupId: g.id, fromUserId: ben.id, toUserId: ana.id, amountCents: 2000 });
    await notifyPaymentRecorded(p.id, ben.id);
    expect(sentEmails).toHaveLength(0);
    expect(pushesTo(ana)).toEqual([expect.objectContaining({ title: "Ben paid you $20.00", url: `/groups/${g.id}` })]);
    expect(pushesTo(ben)).toHaveLength(0);
  });

  it("one-click unsubscribe is signed and idempotent", async () => {
    const u = await user("Una");
    const url = new URL(unsubscribeUrl(u.id, "payments"));
    const [uid, t, s] = ["u", "t", "s"].map((k) => url.searchParams.get(k)!);
    expect(await unsubscribe(uid, t, `${s.slice(0, -1)}x`)).toBe(false);
    expect(await unsubscribe(uid, "expenses", s)).toBe(false); // signature is per type
    expect(await unsubscribe(uid, t, s)).toBe(true);
    expect(await unsubscribe(uid, t, s)).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).notifyPayments).toBe(false);
  });
});

describe("reminders", () => {
  it("only reminds people who owe you, with a cooldown and payment links", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    await updatePaymentHandles(ana.id, { venmoHandle: "ana-lima", paypalMe: "analima" });
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await expect(sendReminder(ana.id, { toUserId: ben.id, groupId: g.id })).rejects.toMatchObject({ code: "CONFLICT" });

    await createExpense(ana.id, {
      groupId: g.id, description: "Rent", amountCents: 100000, paidById: ana.id, date: "2026-11-01",
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }] },
    });
    await expect(sendReminder(ben.id, { toUserId: ana.id, groupId: g.id })).rejects.toMatchObject({ code: "CONFLICT" });
    sentEmails.length = 0;
    await expect(sendReminder(ana.id, { toUserId: ben.id, groupId: g.id })).resolves.toMatchObject({ delivered: true });
    const mail = mailsTo(ben.email)[0];
    expect(mail.subject).toBe("Reminder from Ana: $500.00 in Flat");
    expect(mail.text).toContain("You can pay with Venmo or PayPal, then record the payment");
    expect(mail.text).toContain("Pay Ana $500.00 with PayPal: https://paypal.me/analima/500.00USD");
    expect(mail.html).toContain('href="https://paypal.me/analima/500.00USD"');
    await expect(sendReminder(ana.id, { toUserId: ben.id, groupId: g.id })).rejects.toMatchObject({ code: "RATE_LIMITED" });

    // The cooldown is per pair: another group, or the direct balance, doesn't reset it.
    await addFriendByEmail(ana.id, { email: ben.email }).catch(() => undefined);
    await createExpense(ana.id, {
      friendId: ben.id, description: "Tickets", amountCents: 3000, paidById: ana.id, date: "2026-11-02",
      split: { method: "exact", entries: [{ userId: ana.id, value: 0 }, { userId: ben.id, value: 3000 }] },
    });
    const g2 = await createGroup(ana.id, { name: "Trip" });
    await addMemberByEmail(ana.id, g2.id, { email: ben.email });
    await createExpense(ana.id, {
      groupId: g2.id, description: "Hotel", amountCents: 4000, paidById: ana.id, date: "2026-11-03",
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }] },
    });
    await expect(sendReminder(ana.id, { toUserId: ben.id, friendId: ben.id })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(sendReminder(ana.id, { toUserId: ben.id, groupId: g2.id })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(mailsTo(ben.email).filter((m) => m.subject.startsWith("Reminder"))).toHaveLength(1);

    const out = await user("Out");
    await expect(sendReminder(out.id, { toUserId: ben.id, groupId: g.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("works for direct balances and respects the recipient's settings", async () => {
    const [ana, maya] = await Promise.all([user("Ana"), user("Maya")]);
    await addFriendByEmail(ana.id, { email: maya.email });
    await createExpense(ana.id, {
      friendId: maya.id, description: "Tickets", amountCents: 3000, paidById: ana.id, date: "2026-11-02",
      split: { method: "exact", entries: [{ userId: ana.id, value: 0 }, { userId: maya.id, value: 3000 }] },
    });
    await updateNotificationPrefs(maya.id, { notifyReminders: false });
    sentEmails.length = 0;
    await expect(sendReminder(ana.id, { toUserId: maya.id, friendId: maya.id })).resolves.toMatchObject({ delivered: false });
    expect(sentEmails).toHaveLength(0);
  });

  it("emails a direct reminder with pay links", async () => {
    const [ana, maya] = await Promise.all([user("Ana"), user("Maya")]);
    await updatePaymentHandles(ana.id, { venmoHandle: "ana-lima" });
    await addFriendByEmail(ana.id, { email: maya.email });
    await createExpense(ana.id, {
      friendId: maya.id, description: "Tickets", amountCents: 3000, paidById: ana.id, date: "2026-11-02",
      split: { method: "exact", entries: [{ userId: ana.id, value: 0 }, { userId: maya.id, value: 3000 }] },
    });
    sentEmails.length = 0;
    await expect(sendReminder(ana.id, { toUserId: maya.id, friendId: maya.id })).resolves.toMatchObject({ delivered: true });
    const [mail] = mailsTo(maya.email);
    expect(mail.subject).toBe("Reminder from Ana: $30.00");
    expect(mail.text).toContain("You can pay with Venmo, then record the payment");
    expect(mail.text).toMatch(/Pay Ana \$30\.00 with Venmo: https:\/\/venmo\.com\//);
  });
});

describe("weekly summary", () => {
  it("pushes a summary to opted-in people with a device, once a week, never by email", async () => {
    const [ana, ben, zed, nod] = await Promise.all([user("Ana"), user("Ben"), user("Zed"), user("Nod")]);
    for (const u of [ana, zed]) await device(u);
    await updateNotificationPrefs(ana.id, { weeklyDigest: true });
    await updateNotificationPrefs(zed.id, { weeklyDigest: true }); // all settled → skipped
    await updateNotificationPrefs(nod.id, { weeklyDigest: true }); // no device → skipped
    const g = await createGroup(ana.id, { name: "Trip" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await addMemberByEmail(ana.id, g.id, { email: nod.email });
    await createExpense(ana.id, {
      groupId: g.id, description: "Hotel", amountCents: 4000, paidById: ana.id, date: "2026-11-03",
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }] },
    });
    sentEmails.length = 0;
    await sendWeeklyDigests(new Date("2030-01-07T13:00:00Z"));
    expect(pushesTo(ana)).toEqual([expect.objectContaining({ title: "Your BillSplit week", body: "You're owed $20.00, across 1 person.", url: "/home" })]);
    expect(pushesTo(zed)).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
    sentPushes.length = 0;
    await sendWeeklyDigests(new Date("2030-01-08T13:00:00Z"));
    expect(pushesTo(ana)).toHaveLength(0);
  });

  it("sends once even when two runs overlap", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    await device(ana);
    await updateNotificationPrefs(ana.id, { weeklyDigest: true });
    const g = await createGroup(ana.id, { name: "Trip" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await createExpense(ana.id, {
      groupId: g.id, description: "Hotel", amountCents: 4000, paidById: ana.id, date: "2026-11-03",
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }] },
    });
    const now = new Date("2031-01-06T13:00:00Z");
    await Promise.all([sendWeeklyDigests(now), sendWeeklyDigests(now)]);
    expect(pushesTo(ana)).toHaveLength(1);
  });
});

describe("recurring expenses", () => {
  it("creates the first occurrence now and the rest from the daily job, idempotently", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    const input = {
      groupId: g.id, description: "Internet", amountCents: 6000, paidById: ana.id, date: "2026-11-02",
      split: { method: "equal" as const, entries: [{ userId: ana.id }, { userId: ben.id }] },
    };
    const today = "2026-11-02";
    await expect(createRecurringExpense(ana.id, input, { frequency: "weekly", endsOn: "2026-10-01" }, today)).rejects.toMatchObject({ code: "VALIDATION" });
    const r = await createRecurringExpense(ana.id, input, { frequency: "weekly", endsOn: "2026-11-23" }, today);
    expect(await db.expense.count({ where: { recurringId: r.recurringId } })).toBe(1);

    const [summary] = await listRecurring(ben.id, { groupId: g.id });
    expect(summary).toMatchObject({ schedule: "Every Monday", nextRunOn: "2026-11-09", paused: false, endsOn: "2026-11-23" });
    await expect(listRecurring((await user("Out")).id, { groupId: g.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // The job didn't run for a while (downtime): it catches up on the dates that came due.
    await device(ana);
    await device(ben);
    sentEmails.length = 0;
    await expect(runDueRecurring("2026-11-17")).resolves.toMatchObject({ created: 2 });
    expect(pushesTo(ana)).toHaveLength(2); // recurring: the creator is told too
    expect(pushesTo(ben)).toHaveLength(2);
    expect(sentEmails).toHaveLength(0);
    await expect(runDueRecurring("2026-11-17")).resolves.toMatchObject({ created: 0 });
    const dates = (await db.expense.findMany({ where: { recurringId: r.recurringId }, orderBy: { date: "asc" }, select: { date: true } })).map((e) =>
      e.date.toISOString().slice(0, 10),
    );
    expect(dates).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);

    // Ends after 2026-11-23.
    await runDueRecurring("2026-12-31");
    expect(await db.expense.count({ where: { recurringId: r.recurringId } })).toBe(4);
    expect((await db.recurringExpense.findUniqueOrThrow({ where: { id: r.recurringId } })).stoppedAt).not.toBeNull();
    expect(await listRecurring(ana.id, { groupId: g.id })).toEqual([]);
  });

  it("pauses (without back-filling), resumes, stops, and pauses itself when it can't run", async () => {
    const [ana, maya] = await Promise.all([user("Ana"), user("Maya")]);
    await addFriendByEmail(ana.id, { email: maya.email });
    const r = await createRecurringExpense(
      ana.id,
      {
        friendId: maya.id, description: "Netflix", amountCents: 1500, paidById: ana.id, date: "2026-11-05",
        split: { method: "equal", entries: [{ userId: ana.id }, { userId: maya.id }] },
      },
      { frequency: "monthly" },
      "2026-11-05",
    );
    expect((await listRecurring(maya.id, { friendId: ana.id }))[0]).toMatchObject({ schedule: "Monthly on the 5th", nextRunOn: "2026-12-05" });

    await pauseRecurring(maya.id, r.recurringId);
    await runDueRecurring("2027-02-10");
    expect(await db.expense.count({ where: { recurringId: r.recurringId } })).toBe(1);
    await resumeRecurring(ana.id, r.recurringId, "2027-02-10");
    expect((await listRecurring(ana.id, { friendId: maya.id }))[0]).toMatchObject({ paused: false, nextRunOn: "2027-03-05" });

    // Settle and unfriend: the schedule can't run any more, so it pauses with a reason.
    await recordPayment(maya.id, { friendId: ana.id, fromUserId: maya.id, toUserId: ana.id, amountCents: 750 });
    await removeFriend(ana.id, maya.id);
    await expect(runDueRecurring("2027-03-06")).resolves.toMatchObject({ paused: 1, created: 0 });
    const row = await db.recurringExpense.findUniqueOrThrow({ where: { id: r.recurringId } });
    expect(row.pausedAt).not.toBeNull();
    expect(row.lastError).toBe("You two are no longer friends on BillSplit.");

    await stopRecurring(ana.id, r.recurringId);
    expect((await db.recurringExpense.findUniqueOrThrow({ where: { id: r.recurringId } })).stoppedAt).not.toBeNull();
  });
  it("doesn't back-fill a back-dated schedule, and rejects an end date before the first repeat", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    const base = { groupId: g.id, amountCents: 120000, paidById: ana.id, split: { method: "equal" as const, entries: [{ userId: ana.id }, { userId: ben.id }] } };
    const today = "2026-11-12"; // a Thursday

    // Rent dated Jan 1, set up in November: only the Jan 1 expense now, then Dec 1, not Feb–Nov.
    const rent = await createRecurringExpense(ana.id, { ...base, description: "Rent", date: "2026-01-01" }, { frequency: "monthly" }, today);
    expect((await listRecurring(ana.id, { groupId: g.id })).find((x) => x.id === rent.recurringId)).toMatchObject({ nextRunOn: "2026-12-01" });
    sentEmails.length = 0;
    await runDueRecurring(today);
    expect(await db.expense.count({ where: { recurringId: rent.recurringId } })).toBe(1);
    expect(mailsTo(ben.email)).toHaveLength(0);

    // Weekly from three Thursdays ago: today is on the schedule, so today's is the next one.
    const desk = await createRecurringExpense(ana.id, { ...base, description: "Desk", date: "2026-10-22" }, { frequency: "weekly" }, today);
    expect((await listRecurring(ana.id, { groupId: g.id })).find((x) => x.id === desk.recurringId)).toMatchObject({ nextRunOn: "2026-11-12" });
    await runDueRecurring(today);
    expect(await db.expense.count({ where: { recurringId: desk.recurringId } })).toBe(2);

    // Ends on or after the expense date but before the first repeat: it would never repeat.
    await expect(
      createRecurringExpense(ana.id, { ...base, description: "Once", date: "2026-11-12" }, { frequency: "weekly", endsOn: "2026-11-18" }, today),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { endsOn: "It would end before it repeats. Choose Nov 19, 2026 or later, or leave it empty." } });
    expect(await db.expense.count({ where: { groupId: g.id, description: "Once" } })).toBe(0);
  });

  it("keeps a direct schedule's currency when the creator changes their default currency", async () => {
    const [ana, maya] = await Promise.all([user("Ana"), user("Maya")]);
    await addFriendByEmail(ana.id, { email: maya.email });
    await db.user.update({ where: { id: ana.id }, data: { defaultCurrency: "USD" } });
    const r = await createRecurringExpense(
      ana.id,
      {
        friendId: maya.id, description: "Rent", amountCents: 120000, paidById: ana.id, date: "2026-11-05",
        split: { method: "equal", entries: [{ userId: ana.id }, { userId: maya.id }] },
      },
      { frequency: "monthly" },
      "2026-11-05",
    );
    await db.user.update({ where: { id: ana.id }, data: { defaultCurrency: "EUR" } });
    await runDueRecurring("2026-12-05");
    const currencies = (await db.expense.findMany({ where: { recurringId: r.recurringId }, orderBy: { date: "asc" }, select: { currency: true } })).map((e) => e.currency);
    expect(currencies).toEqual(["USD", "USD"]);
    expect((await listRecurring(maya.id, { friendId: ana.id }))[0]).toMatchObject({ currency: "USD" });
  });

  it("pauses with a specific reason when the person who set it up left the group", async () => {
    const [ana, ben, cy] = await Promise.all([user("Ana"), user("Ben"), user("Cy")]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await addMemberByEmail(ana.id, g.id, { email: cy.email });
    const r = await createRecurringExpense(
      ana.id,
      {
        groupId: g.id, description: "Internet", amountCents: 6000, paidById: ben.id, date: "2026-11-02",
        split: { method: "equal", entries: [{ userId: ben.id }, { userId: cy.id }] },
      },
      { frequency: "weekly" },
      "2026-11-02",
    );
    await db.groupMember.delete({ where: { groupId_userId: { groupId: g.id, userId: ana.id } } });
    await runDueRecurring("2026-11-09");
    expect(await db.expense.count({ where: { recurringId: r.recurringId } })).toBe(1);
    const [row] = await listRecurring(ben.id, { groupId: g.id });
    expect(row).toMatchObject({ id: r.recurringId, paused: true, lastError: "The person who set this up is no longer in the group." });
  });
});

describe("email budget", () => {
  it("reminders go by push when possible and only email as a fallback", async () => {
    const [ana, ben] = await Promise.all([user("Ana"), user("Ben")]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await createExpense(ana.id, {
      groupId: g.id, description: "Rent", amountCents: 100000, paidById: ana.id, date: "2026-11-01",
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }] },
    });
    await device(ben);
    sentEmails.length = 0;
    await expect(sendReminder(ana.id, { toUserId: ben.id, groupId: g.id })).resolves.toMatchObject({ delivered: true });
    expect(pushesTo(ben)).toEqual([expect.objectContaining({ title: "Reminder from Ana" })]);
    expect(sentEmails).toHaveLength(0);
  });

  it("skips optional emails once the day's budget is used, but never required ones", async () => {
    const { sendEmail } = await import("@/lib/server/mailer");
    const saved = process.env.EMAIL_OPTIONAL_DAILY_CAP;
    const mail = (to: string) => ({ to, subject: "s", text: "t", html: "<p>t</p>" });
    try {
      process.env.EMAIL_OPTIONAL_DAILY_CAP = "0";
      sentEmails.length = 0;
      await expect(sendEmail(mail("optional@test.dev"), { priority: "optional" })).resolves.toBe(false);
      await expect(sendEmail(mail("required@test.dev"))).resolves.toBe(true);
      expect(sentEmails.map((m) => m.to)).toEqual(["required@test.dev"]);
    } finally {
      process.env.EMAIL_OPTIONAL_DAILY_CAP = saved;
    }
  });
});
