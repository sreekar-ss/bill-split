import { beforeEach, describe, expect, it } from "vitest";
import { deleteAccount, updatePaymentHandles } from "@/lib/server/account";
import { db } from "@/lib/server/db";
import { getClaim, verifyEmail } from "@/lib/server/email-tokens";
import { createExpense } from "@/lib/server/expenses";
import { addFriendByEmail, getFriend } from "@/lib/server/friends";
import { addMemberByEmail, createGroup, getGroup, removeMember } from "@/lib/server/groups";
import { getInviteLink, joinGroupByInvite, resetInviteLink } from "@/lib/server/invites";
import { PLACEHOLDERS_PER_USER_PER_DAY, UNCONFIRMED_INVITEE } from "@/lib/server/invitees";
import { sentEmails } from "@/lib/server/mailer";
import { requestPasswordReset, resetPassword } from "@/lib/server/password-reset";
import { authenticate, registerUser } from "@/lib/server/users";

const today = "2026-11-13";
let n = 0;
const email = (who: string) => `${who}.hard.${++n}@test.dev`;
const ip = () => `198.19.${(n >> 8) & 255}.${n & 255}`;
const registerUnverified = (name: string, address = email(name.toLowerCase())) =>
  registerUser({ name, email: address, password: "password123" }, { ip: ip() });
async function register(name: string) {
  const u = await registerUnverified(name);
  await db.user.update({ where: { id: u.id }, data: { emailVerified: true } });
  return u;
}

function linkIn(to: string, path: string) {
  const mail = [...sentEmails].reverse().find((m) => m.to === to && m.text.includes(path));
  const m = mail?.text.match(new RegExp(`${path.replace(/[/?]/g, "\\$&")}\\?token=([\\w%-]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function resetVia(address: string, password: string) {
  await requestPasswordReset({ email: address });
  const token = linkIn(address, "/reset-password");
  expect(token).toBeTruthy();
  return resetPassword({ token, password });
}

beforeEach(() => {
  sentEmails.length = 0;
});

describe("finding people by email", () => {
  it("won't add an account whose email hasn't been confirmed, so a squatter can't stand in for the real owner", async () => {
    const ana = await register("Ana");
    const g = await createGroup(ana.id, { name: "Lisbon" });
    const squatted = await registerUnverified("Ben");

    await expect(addMemberByEmail(ana.id, g.id, { email: squatted.email })).rejects.toMatchObject({ code: "CONFLICT", message: UNCONFIRMED_INVITEE });
    await expect(addFriendByEmail(ana.id, { email: squatted.email })).rejects.toMatchObject({ code: "CONFLICT", message: UNCONFIRMED_INVITEE });
    expect((await getGroup(ana.id, g.id)).members).toHaveLength(1);
    // No placeholder or invite was created behind the scenes either.
    expect(await db.user.count({ where: { email: squatted.email } })).toBe(1);

    // Once the mailbox owner confirms, they can be found.
    expect(await verifyEmail(linkIn(squatted.email, "/verify-email")!)).toBe(squatted.id);
    await expect(addMemberByEmail(ana.id, g.id, { email: squatted.email })).resolves.toMatchObject({ id: squatted.id, invited: false });
  });

  it("only lets confirmed accounts create placeholders, and caps them per day", async () => {
    const fresh = await registerUnverified("Una");
    await expect(addFriendByEmail(fresh.id, { email: email("ghost"), name: "Ghost" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const ana = await register("Ana");
    await db.rateLimit.create({
      data: { key: `invite:user:${ana.id}`, count: PLACEHOLDERS_PER_USER_PER_DAY, resetAt: new Date(Date.now() + 3600_000) },
    });
    const g = await createGroup(ana.id, { name: "Party" });
    const extra = email("extra");
    await expect(addMemberByEmail(ana.id, g.id, { email: extra, name: "Extra" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await db.user.count({ where: { email: extra } })).toBe(0);
    expect(sentEmails.filter((m) => m.to === extra)).toHaveLength(0);
  });

  it("keeps user-chosen names out of the invite subject", async () => {
    const ana = await register("Ana");
    await db.user.update({ where: { id: ana.id }, data: { name: "Security team" } });
    const g = await createGroup(ana.id, { name: "Your account is locked" });
    const to = email("target");
    await addMemberByEmail(ana.id, g.id, { email: to, name: "Target" });
    const mail = sentEmails.find((m) => m.to === to)!;
    expect(mail.subject).toBe("You're invited to split expenses on BillSplit");
  });
});

describe("payment handles", () => {
  it("are hidden from someone who added you until you've dealt with them", async () => {
    const [ana, ben] = await Promise.all([register("Ana"), register("Ben")]);
    await updatePaymentHandles(ben.id, { venmoHandle: "ben-v", upiId: "9876543210@okbank" });
    await updatePaymentHandles(ana.id, { venmoHandle: "ana-v" });
    const g = await createGroup(ana.id, { name: "Flat" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });

    const benAsSeenByAna = async () => (await getGroup(ana.id, g.id)).members.find((m) => m.id === ben.id)!;
    expect(await benAsSeenByAna()).toMatchObject({ venmoHandle: null, upiId: null });
    expect((await getFriend(ana.id, ben.id)).friend).toMatchObject({ venmoHandle: null, upiId: null });
    // Ana created the group and added Ben herself, so Ben sees hers.
    expect((await getGroup(ben.id, g.id)).members.find((m) => m.id === ana.id)).toMatchObject({ venmoHandle: "ana-v" });
    expect((await getFriend(ben.id, ana.id)).friend).toMatchObject({ venmoHandle: "ana-v" });
    // Ana recording an expense "paid by Ben" doesn't count as Ben taking part.
    await createExpense(ana.id, {
      groupId: g.id, description: "Milk", amountCents: 400, paidById: ben.id, date: today,
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }] },
    });
    expect(await benAsSeenByAna()).toMatchObject({ venmoHandle: null });

    // Ben records something himself: now Ana can pay him through his apps.
    await createExpense(ben.id, {
      groupId: g.id, description: "Bread", amountCents: 300, paidById: ben.id, date: today,
      split: { method: "equal", entries: [{ userId: ana.id }, { userId: ben.id }] },
    });
    expect(await benAsSeenByAna()).toMatchObject({ venmoHandle: "ben-v", upiId: "9876543210@okbank" });
    expect((await getFriend(ana.id, ben.id)).friend).toMatchObject({ venmoHandle: "ben-v" });
  });

  it("are shown when the owner started the friendship", async () => {
    const [ana, ben] = await Promise.all([register("Ana"), register("Ben")]);
    await updatePaymentHandles(ben.id, { paypalMe: "benpp" });
    await addFriendByEmail(ben.id, { email: ana.email });
    expect((await getFriend(ana.id, ben.id)).friend).toMatchObject({ paypalMe: "benpp" });
  });
});

describe("password reset", () => {
  it("activates an invited placeholder (the link proves the mailbox) and retires their claim link", async () => {
    const ana = await register("Ana");
    const cleoEmail = email("cleo");
    const cleo = await addFriendByEmail(ana.id, { email: cleoEmail, name: "Cleo" });
    const claimToken = linkIn(cleoEmail, "/invite/accept")!;

    const user = await resetVia(cleoEmail, "cleos-password-1");
    expect(user.id).toBe(cleo.id);
    expect(await db.user.findUniqueOrThrow({ where: { id: cleo.id } })).toMatchObject({ status: "active", emailVerified: true, name: "Cleo" });
    await expect(authenticate({ email: cleoEmail, password: "cleos-password-1" }, { ip: ip() })).resolves.toMatchObject({ id: cleo.id });
    expect(await getClaim(claimToken)).toBeNull();
  });

  it("drops payment handles left on an account whose email was never confirmed", async () => {
    // Someone signed up with Vic's address first and saved their own handles.
    const squatter = await registerUnverified("Vic");
    await updatePaymentHandles(squatter.id, { venmoHandle: "not-vic", cashTag: "notvic" });
    // The real Vic recovers it through the mailbox.
    await resetVia(squatter.email, "vics-own-password");
    expect(await db.user.findUniqueOrThrow({ where: { id: squatter.id } })).toMatchObject({
      emailVerified: true, venmoHandle: null, cashTag: null, paypalMe: null, upiId: null,
    });
  });

  it("keeps handles on an account that was already confirmed", async () => {
    const wes = await register("Wes");
    await updatePaymentHandles(wes.id, { venmoHandle: "wes-v" });
    await resetVia(wes.email, "wes-new-password");
    expect((await db.user.findUniqueOrThrow({ where: { id: wes.id } })).venmoHandle).toBe("wes-v");
  });
});

describe("login lockout", () => {
  it("locks the email only for the network that failed, and a reset clears it", async () => {
    const u = await register("Lia");
    const attacker = { ip: "203.0.113.200" };
    for (let i = 0; i < 8; i++) await expect(authenticate({ email: u.email, password: "wrong-pass" }, attacker)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(authenticate({ email: u.email, password: "password123" }, attacker)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    // The owner, elsewhere, still gets in with the right password.
    await expect(authenticate({ email: u.email, password: "password123" }, { ip: "198.51.100.200" })).resolves.toMatchObject({ id: u.id });

    // Recovering through the mailbox lifts the lockout everywhere.
    await resetVia(u.email, "lias-new-password");
    await expect(authenticate({ email: u.email, password: "lias-new-password" }, attacker)).resolves.toMatchObject({ id: u.id });
  });

  it("counts parallel guesses before checking them, so a burst can't exceed the limit", async () => {
    const u = await register("Bea");
    const meta = { ip: "203.0.113.201" };
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => authenticate({ email: u.email, password: "wrong-pass" }, meta)),
    );
    const codes = results.map((r) => (r.status === "rejected" ? (r.reason as { code: string }).code : "OK"));
    expect(codes.filter((c) => c === "UNAUTHENTICATED")).toHaveLength(8);
    expect(codes.filter((c) => c === "RATE_LIMITED")).toHaveLength(12);
  });
});

describe("group management", () => {
  it("resets the invite link when an admin removes someone, so they can't rejoin with it", async () => {
    const [ana, ben] = await Promise.all([register("Ana"), register("Ben")]);
    const g = await createGroup(ana.id, { name: "Club" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    const saved = (await getInviteLink(ben.id, g.id)).url.split("/join/")[1];

    await expect(removeMember(ana.id, g.id, ben.id)).resolves.toMatchObject({ inviteLinkReset: true });
    await expect(joinGroupByInvite(ben.id, saved)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const fresh = (await getInviteLink(ana.id, g.id)).url.split("/join/")[1];
    expect(fresh).not.toBe(saved);
  });

  it("hands admin to a remaining member when the only admin deletes their account", async () => {
    const [ana, ben, cy] = await Promise.all([register("Ana"), register("Ben"), register("Cy")]);
    const g = await createGroup(ana.id, { name: "Trip" });
    await addMemberByEmail(ana.id, g.id, { email: ben.email });
    await addMemberByEmail(ana.id, g.id, { email: cy.email });
    const solo = await createGroup(ana.id, { name: "Just me" });

    await deleteAccount(ana.id, { password: "password123" });
    expect((await getGroup(ben.id, g.id)).isAdmin).toBe(true);
    expect((await getGroup(cy.id, g.id)).isAdmin).toBe(false);
    await expect(resetInviteLink(ben.id, g.id)).resolves.toBeTruthy();
    // A group nobody is left in can't be joined.
    expect(await db.group.findUniqueOrThrow({ where: { id: solo.id }, select: { inviteEnabled: true } })).toEqual({ inviteEnabled: false });
  });
});
