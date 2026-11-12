import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccount, exportAccountData, logoutEverywhere, updatePaymentHandles } from "@/lib/server/account";
import { db } from "@/lib/server/db";
import { claimAccount, getClaim, resendClaimForEmail, sendVerificationEmail, verifyEmail } from "@/lib/server/email-tokens";
import { createExpense } from "@/lib/server/expenses";
import { addFriendByEmail, listFriends } from "@/lib/server/friends";
import { addMemberByEmail, createGroup, getGroup } from "@/lib/server/groups";
import { getInviteLink, getInvitePreview, joinGroupByInvite, resetInviteLink } from "@/lib/server/invites";
import { sentEmails } from "@/lib/server/mailer";
import { recordPayment } from "@/lib/server/payments";
import { authenticate, registerUser } from "@/lib/server/users";

const today = "2026-11-13";
let n = 0;
const email = (who: string) => `${who}.v2a.${++n}@test.dev`;
const register = (name: string) => registerUser({ name, email: email(name.toLowerCase()), password: "password123" });

function linkIn(to: string, path: string) {
  const mail = [...sentEmails].reverse().find((m) => m.to === to && m.text.includes(path));
  const m = mail?.text.match(new RegExp(`${path.replace(/[/?]/g, "\\$&")}\\?token=([\\w%-]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

beforeEach(() => {
  sentEmails.length = 0;
});

describe("email verification", () => {
  it("sends a link on sign-up that verifies once", async () => {
    const u = await register("Vera");
    const token = linkIn(u.email, "/verify-email");
    expect(token).toBeTruthy();
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerified).toBe(false);
    expect(await verifyEmail(token!)).toBe(u.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerified).toBe(true);
    expect(await verifyEmail(token!)).toBeNull();
    expect(await verifyEmail("nonsense")).toBeNull();
  });

  it("throttles resends", async () => {
    const u = await register("Rex");
    expect(await sendVerificationEmail(u.id)).toBe(false); // sign-up email was just sent
    expect(sentEmails.filter((m) => m.to === u.email)).toHaveLength(1);
  });
});

describe("invited placeholders", () => {
  it("lets a group add someone by email before they sign up, then hands over their history", async () => {
    const ana = await register("Ana");
    const g = await createGroup(ana.id, { name: "Lisbon" });
    const benEmail = email("ben");

    await expect(addMemberByEmail(ana.id, g.id, { email: benEmail })).rejects.toMatchObject({ fieldErrors: { name: expect.any(String) } });
    const added = await addMemberByEmail(ana.id, g.id, { email: benEmail, name: "Ben" });
    expect(added).toMatchObject({ name: "Ben", invited: true });
    const invite = sentEmails.find((m) => m.to === benEmail);
    expect(invite?.subject).toBe("Ana added you to Lisbon on BillSplit");

    // Placeholders can pay and share right away.
    await createExpense(ana.id, {
      groupId: g.id, description: "Dinner", amountCents: 6000, paidById: added.id, date: today,
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: added.id }] },
    });
    let group = await getGroup(ana.id, g.id);
    expect(group.members.find((m) => m.id === added.id)).toMatchObject({ status: "placeholder", netCents: 3000 });

    // They can't log in or register over the placeholder.
    await expect(authenticate({ email: benEmail, password: "" })).rejects.toBeTruthy();
    await expect(authenticate({ email: benEmail, password: "anything123" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(registerUser({ name: "Mallory", email: benEmail, password: "password123" })).rejects.toMatchObject({
      code: "CONFLICT",
      fieldErrors: { invite: "pending" },
    });

    // Claiming through the emailed link keeps the same identity and history.
    const token = linkIn(benEmail, "/invite/accept")!;
    expect(await getClaim(token)).toEqual({ email: benEmail, name: "Ben" });
    await expect(claimAccount({ token, name: "Ben Ito", password: "short" })).rejects.toMatchObject({ code: "VALIDATION" });
    const claimed = await claimAccount({ token, name: "Ben Ito", password: "bens-password-1" });
    expect(claimed.id).toBe(added.id);
    await expect(authenticate({ email: benEmail, password: "bens-password-1" })).resolves.toMatchObject({ id: added.id });
    expect(await db.user.findUniqueOrThrow({ where: { id: added.id } })).toMatchObject({ status: "active", emailVerified: true, name: "Ben Ito" });
    group = await getGroup(added.id, g.id);
    expect(group.myNetCents).toBe(3000);
    await expect(claimAccount({ token, name: "X", password: "password123" })).rejects.toMatchObject({ fieldErrors: { token: expect.any(String) } });
    expect(await getClaim(token)).toBeNull();
  });

  it("re-uses an existing placeholder and supports friends, without needing the name again", async () => {
    const ana = await register("Ana");
    const caro = email("caro");
    const f = await addFriendByEmail(ana.id, { email: caro, name: "Caro" });
    expect(f.invited).toBe(true);
    expect((await listFriends(ana.id)).map((x) => x.name)).toEqual(["Caro"]);
    const g = await createGroup(ana.id, { name: "Flat" });
    await expect(addMemberByEmail(ana.id, g.id, { email: caro })).resolves.toMatchObject({ id: f.id, invited: true });
    expect(await db.user.count({ where: { email: caro } })).toBe(1);
  });

  it("resends a claim link from the sign-up page without revealing anything", async () => {
    const ana = await register("Ana");
    const dee = email("dee");
    await addFriendByEmail(ana.id, { email: dee, name: "Dee" });
    await db.emailToken.updateMany({ where: { user: { email: dee } }, data: { createdAt: new Date(Date.now() - 120_000) } });
    sentEmails.length = 0;
    await resendClaimForEmail(dee);
    await resendClaimForEmail("nobody.at.all@test.dev");
    expect(sentEmails.map((m) => m.to)).toEqual([dee]);
  });
});

describe("group invite links", () => {
  it("lets anyone with the link join, until it's reset", async () => {
    const [ana, ben, cy, out] = await Promise.all([register("Ana"), register("Ben"), register("Cy"), register("Out")]);
    const g = await createGroup(ana.id, { name: "Trip" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await expect(getInviteLink(out.id, g.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    const { url } = await getInviteLink(ben.id, g.id);
    const token = url.split("/join/")[1];
    expect(await getInvitePreview(token, cy.id)).toMatchObject({ name: "Trip", memberCount: 2, alreadyMember: false });
    expect(await getInvitePreview(`${token}x`)).toBeNull();
    expect(await getInvitePreview(`${g.id}.AAAAAAAAAAAAAAAAAAAAAA`)).toBeNull();

    await expect(joinGroupByInvite(cy.id, token)).resolves.toEqual({ groupId: g.id, joined: true });
    await expect(joinGroupByInvite(cy.id, token)).resolves.toEqual({ groupId: g.id, joined: false });
    expect((await listFriends(cy.id)).map((f) => f.name).sort()).toEqual(["Ana", "Ben"]);

    await expect(resetInviteLink(ben.id, g.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const fresh = await resetInviteLink(ana.id, g.id);
    expect(fresh.url).not.toBe(url);
    await expect(joinGroupByInvite(out.id, token)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(joinGroupByInvite(out.id, fresh.url.split("/join/")[1])).resolves.toMatchObject({ joined: true });
  });
});

describe("login protection", () => {
  it("locks an email after repeated failures and clears on success", async () => {
    const u = await register("Lou");
    for (let i = 0; i < 3; i++) await expect(authenticate({ email: u.email, password: "wrong-pass" })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticate({ email: u.email, password: "password123" })).resolves.toBeTruthy();
    for (let i = 0; i < 8; i++) await expect(authenticate({ email: u.email, password: "wrong-pass" })).rejects.toBeTruthy();
    await expect(authenticate({ email: u.email, password: "password123" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("limits failures per IP across emails", async () => {
    const meta = { ip: `203.0.113.${n % 250}` };
    for (let i = 0; i < 30; i++) await authenticate({ email: `ghost${i}.${n}@test.dev`, password: "x" }, meta).catch(() => {});
    const u = await register("Ivy");
    await expect(authenticate({ email: u.email, password: "password123" }, meta)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(authenticate({ email: u.email, password: "password123" }, { ip: "198.51.100.7" })).resolves.toBeTruthy();
  });
});

describe("account controls", () => {
  it("validates and normalises payment handles", async () => {
    const u = await register("Pat");
    await expect(updatePaymentHandles(u.id, { venmoHandle: "@pat-lee", cashTag: "$patlee", paypalMe: "", upiId: "pat@okhdfc" })).resolves.toEqual({
      venmoHandle: "pat-lee", cashTag: "patlee", paypalMe: null, upiId: "pat@okhdfc",
    });
    await expect(updatePaymentHandles(u.id, { upiId: "not a upi" })).rejects.toMatchObject({ fieldErrors: { upiId: expect.any(String) } });
  });

  it("logs out everywhere", async () => {
    const u = await register("Sam");
    await logoutEverywhere(u.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).sessionVersion).toBe(u.sessionVersion + 1);
  });

  it("exports data and deletes (anonymises) only once settled", async () => {
    const [ana, zoe] = await Promise.all([register("Ana"), register("Zoe")]);
    const g = await createGroup(ana.id, { name: "Gym" });
    await addMemberByEmail(ana.id, g.id, { email: zoe.email });
    await createExpense(ana.id, {
      groupId: g.id, description: "Class pass", amountCents: 4000, paidById: ana.id, date: today,
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: zoe.id }] },
    });

    const exported = await exportAccountData(zoe.id);
    expect(exported.profile.email).toBe(zoe.email);
    expect(exported.expenses.map((e) => e.description)).toEqual(["Class pass"]);
    expect(JSON.stringify(exported)).not.toContain("password");

    await expect(deleteAccount(zoe.id, { password: "wrong" })).rejects.toMatchObject({ fieldErrors: { password: expect.any(String) } });
    await expect(deleteAccount(zoe.id, { password: "password123" })).rejects.toMatchObject({ code: "CONFLICT" });
    await recordPayment(zoe.id, { groupId: g.id, fromUserId: zoe.id, toUserId: ana.id, amountCents: 2000 });
    await deleteAccount(zoe.id, { password: "password123" });

    const gone = await db.user.findUniqueOrThrow({ where: { id: zoe.id } });
    expect(gone).toMatchObject({ status: "deleted", name: "Deleted user", password: "" });
    expect(gone.email).not.toBe(zoe.email);
    await expect(authenticate({ email: zoe.email, password: "password123" })).rejects.toBeTruthy();
    const group = await getGroup(ana.id, g.id);
    expect(group.members.map((m) => m.name)).toEqual(["Ana"]);
    expect(group.myNetCents).toBe(0);
    // The email is free to use again.
    await expect(registerUser({ name: "Zoe again", email: zoe.email, password: "password123" })).resolves.toBeTruthy();
  });
});
