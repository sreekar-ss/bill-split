import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { sentEmails } from "@/lib/server/mailer";
import { isResetTokenUsable, requestPasswordReset, resetPassword } from "@/lib/server/password-reset";
import { authenticate, changePassword, registerUser } from "@/lib/server/users";

let n = 0;
async function user() {
  n += 1;
  return registerUser({ name: "Rae", email: `rae.reset.${n}@test.dev`, password: "old-password-1" });
}

function lastLinkTo(email: string) {
  const mail = [...sentEmails].reverse().find((m) => m.to === email);
  const match = mail?.text.match(/https:\/\/app\.example\.test\/reset-password\?token=([\w%-]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

beforeEach(() => {
  sentEmails.length = 0;
});

describe("password reset", () => {
  it("says nothing about unknown emails and sends nothing", async () => {
    await expect(requestPasswordReset({ email: "nobody-here@test.dev" })).resolves.toBeUndefined();
    expect(sentEmails).toHaveLength(0);
    await expect(requestPasswordReset({ email: "not-an-email" })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("emails a single-use link built from APP_URL and stores only a hash", async () => {
    const u = await user();
    await requestPasswordReset({ email: `  ${u.email.toUpperCase()} ` });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({ to: u.email, subject: "Reset your BillSplit password" });
    expect(sentEmails[0].html).toContain("Choose a new password");
    const token = lastLinkTo(u.email)!;
    expect(token).toMatch(/^[\w-]{43}$/);

    const rows = await db.passwordResetToken.findMany({ where: { userId: u.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(rows[0].tokenHash).not.toContain(token);
    const ttlMin = (rows[0].expiresAt.getTime() - rows[0].createdAt.getTime()) / 60000;
    expect(Math.round(ttlMin)).toBe(30);
  });

  it("rate-limits repeat requests", async () => {
    const u = await user();
    await requestPasswordReset({ email: u.email });
    await requestPasswordReset({ email: u.email });
    expect(sentEmails.filter((m) => m.to === u.email)).toHaveLength(1);
  });

  it("resets the password, signs out other sessions, and can't be reused", async () => {
    const u = await user();
    await requestPasswordReset({ email: u.email });
    const token = lastLinkTo(u.email)!;
    expect(await isResetTokenUsable(token)).toBe(true);

    await expect(resetPassword({ token, password: "short" })).rejects.toMatchObject({ fieldErrors: { password: expect.any(String) } });
    expect(await isResetTokenUsable(token)).toBe(true); // a validation failure doesn't burn the link

    const updated = await resetPassword({ token, password: "new-password-2" });
    expect(updated.sessionVersion).toBe(u.sessionVersion + 1);
    await expect(authenticate({ email: u.email, password: "new-password-2" })).resolves.toMatchObject({ id: u.id });
    await expect(authenticate({ email: u.email, password: "old-password-1" })).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).emailVerified).toBe(true);

    expect(await isResetTokenUsable(token)).toBe(false);
    await expect(resetPassword({ token, password: "another-pass-3" })).rejects.toMatchObject({ fieldErrors: { token: expect.stringContaining("expired") } });
  });

  it("only one of two concurrent submits succeeds", async () => {
    const u = await user();
    await requestPasswordReset({ email: u.email });
    const token = lastLinkTo(u.email)!;
    const results = await Promise.allSettled([
      resetPassword({ token, password: "race-password-a" }),
      resetPassword({ token, password: "race-password-b" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("rejects expired and made-up tokens", async () => {
    const u = await user();
    const token = "expired-token-value-that-is-long-enough-123";
    await db.passwordResetToken.create({
      data: { userId: u.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await isResetTokenUsable(token)).toBe(false);
    await expect(resetPassword({ token, password: "new-password-2" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(resetPassword({ token: "x".repeat(43), password: "new-password-2" })).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await isResetTokenUsable(undefined)).toBe(false);
  });

  it("changing the password from the account page revokes outstanding links", async () => {
    const u = await user();
    await requestPasswordReset({ email: u.email });
    const token = lastLinkTo(u.email)!;
    await changePassword(u.id, { currentPassword: "old-password-1", newPassword: "changed-pass-9" });
    expect(await isResetTokenUsable(token)).toBe(false);
  });

  it("refuses clearly (for every address) when email isn't configured in production", async () => {
    const env = process.env as Record<string, string | undefined>;
    const saved = { MAIL_TRANSPORT: env.MAIL_TRANSPORT, NODE_ENV: env.NODE_ENV, RESEND_API_KEY: env.RESEND_API_KEY };
    try {
      delete env.MAIL_TRANSPORT;
      delete env.RESEND_API_KEY;
      env.NODE_ENV = "production";
      await expect(requestPasswordReset({ email: "anyone@test.dev" })).rejects.toThrow("aren't set up");
    } finally {
      Object.assign(env, saved);
    }
  });
});
