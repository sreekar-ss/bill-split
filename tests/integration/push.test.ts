import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import { createExpense } from "@/lib/server/expenses";
import { createGroup } from "@/lib/server/groups";
import { sentEmails } from "@/lib/server/mailer";
import { notifyExpenseCreated, sendReminder, updateNotificationPrefs } from "@/lib/server/notifications";
import { hasPushDevices, removePushSubscription, savePushSubscription, sendPushToUser, sentPushes } from "@/lib/server/push";
import { registerUser } from "@/lib/server/users";

let n = 0;
async function user(name: string, verified = true) {
  n += 1;
  const u = await registerUser({ name, email: `${name.toLowerCase()}.push.${n}@test.dev`, password: "password123" }, { ip: `192.0.2.${200 + (n % 50)}` });
  if (verified) await db.user.update({ where: { id: u.id }, data: { emailVerified: true } });
  return u;
}
const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
const sub = (endpoint: string) => ({ endpoint, keys });

beforeEach(() => {
  sentPushes.length = 0;
  sentEmails.length = 0;
});

describe("push subscriptions", () => {
  it("only accepts real push services (no SSRF)", async () => {
    const u = await user("Pia");
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/push",
      "https://evil.example/push",
      "https://fcm.googleapis.com.evil.example/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
    ]) {
      await expect(savePushSubscription(u.id, sub(bad)), bad).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(savePushSubscription(u.id, { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: "short", auth: "x" } })).rejects.toBeTruthy();
    await savePushSubscription(u.id, sub("https://fcm.googleapis.com/fcm/send/abc"));
    await savePushSubscription(u.id, sub("https://web.push.apple.com/QGxyz"));
    await savePushSubscription(u.id, sub("https://updates.push.services.mozilla.com/wpush/v2/x"));
    expect(await db.pushSubscription.count({ where: { userId: u.id } })).toBe(3);
  });

  it("one owner per device, capped at 10 devices, removable", async () => {
    const [a, b] = await Promise.all([user("Abe"), user("Bea")]);
    const ep = `https://push.test/shared-${n}`;
    await savePushSubscription(a.id, sub(ep));
    await savePushSubscription(b.id, sub(ep)); // same phone, now signed in as Bea
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: ep } })).userId).toBe(b.id);
    for (let i = 0; i < 12; i++) await savePushSubscription(a.id, sub(`https://push.test/a-${n}-${i}`));
    expect(await db.pushSubscription.count({ where: { userId: a.id } })).toBe(10);
    await removePushSubscription(a.id, ep); // not hers: no effect
    expect(await hasPushDevices(b.id)).toBe(true);
    await removePushSubscription(b.id, ep);
    expect(await hasPushDevices(b.id)).toBe(false);
  });
});

describe("delivery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.PUSH_TRANSPORT = "memory";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  it("pushes alongside email, even to unconfirmed emails, respecting preferences", async () => {
    const [ana, ben, cy] = await Promise.all([user("Ana"), user("Ben", false), user("Cy")]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await db.groupMember.createMany({ data: [{ groupId: g.id, userId: ben.id }, { groupId: g.id, userId: cy.id }] });
    await savePushSubscription(ben.id, sub(`https://push.test/ben-${n}`));
    await savePushSubscription(cy.id, sub(`https://push.test/cy-${n}`));
    await updateNotificationPrefs(cy.id, { notifyExpenses: false });
    sentEmails.length = 0;

    const e = await createExpense(ana.id, {
      groupId: g.id, description: "Dinner", amountCents: 9000, paidById: ana.id, date: "2026-11-14",
      split: { method: "equal", entries: [ana, ben, cy].map((u) => ({ userId: u.id })) },
    });
    await notifyExpenseCreated(e.id, ana.id);
    expect(sentPushes).toEqual([
      { endpoint: `https://push.test/ben-${n}`, title: "Ana added Dinner", body: "You owe $30.00. In Flat.", url: `/expenses/${e.id}`, tag: `expense-${e.id}` },
    ]);
    expect(sentEmails).toHaveLength(0); // Ben's email isn't confirmed; Cy turned expenses off

    // A reminder reaches Ben by push alone and counts as delivered.
    await expect(sendReminder(ana.id, { toUserId: ben.id, groupId: g.id })).resolves.toMatchObject({ delivered: true });
    expect(sentPushes.at(-1)).toMatchObject({ title: "Reminder from Ana", url: `/groups/${g.id}` });
  });

  it("removes devices the push service says are gone", async () => {
    const u = await user("Gus");
    const keysPair = webpush.generateVAPIDKeys();
    process.env.PUSH_TRANSPORT = "";
    process.env.VAPID_PUBLIC_KEY = keysPair.publicKey;
    process.env.VAPID_PRIVATE_KEY = keysPair.privateKey;
    await savePushSubscription(u.id, sub("https://fcm.googleapis.com/fcm/send/gone"));
    await savePushSubscription(u.id, sub("https://fcm.googleapis.com/fcm/send/flaky"));
    vi.spyOn(webpush, "sendNotification").mockImplementation(async (s) => {
      throw Object.assign(new Error("push failed"), { statusCode: s.endpoint.endsWith("gone") ? 410 : 500 });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sendPushToUser(u.id, { title: "t", body: "b", url: "/home" })).resolves.toBe(0);
    const left = await db.pushSubscription.findMany({ where: { userId: u.id } });
    expect(left.map((s) => [s.endpoint.split("/").at(-1), s.failures])).toEqual([["flaky", 1]]);
  });
});

describe("security review fixes", () => {
  it("a device can't be taken over with a known endpoint but different keys", async () => {
    const [a, mallory] = await Promise.all([user("Ada"), user("Mal")]);
    const ep = `https://push.test/victim-${n}`;
    await savePushSubscription(a.id, sub(ep));
    await expect(savePushSubscription(mallory.id, { endpoint: ep, keys: { p256dh: "C".repeat(87), auth: "D".repeat(22) } })).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: ep } })).userId).toBe(a.id);
  });

  it("logging out everywhere, changing the password or deleting the account cuts devices off", async () => {
    const { logoutEverywhere, deleteAccount } = await import("@/lib/server/account");
    const { changePassword } = await import("@/lib/server/users");
    const u = await user("Cut");
    const save = (tag: string) => savePushSubscription(u.id, sub(`https://push.test/${tag}-${n}`));

    await save("a");
    await logoutEverywhere(u.id);
    expect(await hasPushDevices(u.id)).toBe(false);

    await save("b");
    await changePassword(u.id, { currentPassword: "password123", newPassword: "password456" });
    expect(await hasPushDevices(u.id)).toBe(false);

    await save("c");
    await deleteAccount(u.id, { password: "password456" });
    expect(await db.pushSubscription.count({ where: { userId: u.id } })).toBe(0);
  });

  it("devices registered under an older session version get nothing and are removed", async () => {
    const u = await user("Old");
    await savePushSubscription(u.id, sub(`https://push.test/old-${n}`));
    await db.user.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 } } }); // e.g. revoked elsewhere
    await expect(sendPushToUser(u.id, { title: "t", body: "b", url: "/home" })).resolves.toBe(0);
    expect(sentPushes).toHaveLength(0);
    expect(await hasPushDevices(u.id)).toBe(false);
  });

  it("daily housekeeping deletes stale throttling records and old emailed links; export covers recurring and devices", async () => {
    const { purgeExpiredRecords } = await import("@/lib/server/housekeeping");
    const { exportAccountData } = await import("@/lib/server/account");
    const u = await user("Hk");
    const old = new Date(Date.now() - 2 * 86400000);
    await db.rateLimit.create({ data: { key: `login:ip:203.0.113.9:${n}`, count: 3, resetAt: old } });
    await db.rateLimit.create({ data: { key: `login:ip:203.0.113.10:${n}`, count: 1, resetAt: new Date(Date.now() + 60000) } });
    await db.emailToken.create({ data: { userId: u.id, purpose: "verify_email", tokenHash: `old-${n}`, expiresAt: new Date(Date.now() - 40 * 86400000) } });
    await purgeExpiredRecords();
    expect(await db.rateLimit.count({ where: { key: `login:ip:203.0.113.9:${n}` } })).toBe(0);
    expect(await db.rateLimit.count({ where: { key: `login:ip:203.0.113.10:${n}` } })).toBe(1);
    expect(await db.emailToken.count({ where: { tokenHash: `old-${n}` } })).toBe(0);

    await savePushSubscription(u.id, sub(`https://push.test/exp-${n}`), "Mozilla/5.0 (iPhone)");
    const data = await exportAccountData(u.id);
    expect(data.pushDevices).toEqual([expect.objectContaining({ userAgent: "Mozilla/5.0 (iPhone)" })]);
    expect(data).toHaveProperty("recurringExpenses");
    expect(data.profile).toMatchObject({ notifyExpenses: true, weeklyDigest: false });
  });
});
