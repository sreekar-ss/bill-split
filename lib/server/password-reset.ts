import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { forgotPasswordSchema, resetPasswordSchema } from "@/lib/validation";
import { appUrl } from "./app-url";
import { db } from "./db";
import { AppError } from "./errors";
import { isEmailConfigured, sendEmail } from "./mailer";
import { parse } from "./parse";
import { clearLoginThrottle } from "./rate-limit";

export const RESET_TOKEN_TTL_MINUTES = 30;
/** Don't send another email if one went out this recently (stops inbox flooding). */
const RESEND_COOLDOWN_SECONDS = 60;
/** At most this many reset emails per account per hour. */
const MAX_PER_HOUR = 5;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

const EXPIRED_MESSAGE = "This reset link has expired or was already used. Request a new one below.";

/**
 * Start a password reset. Always resolves the same way whether or not the email has an
 * account, so the form can't be used to discover who's signed up.
 */
export async function requestPasswordReset(input: unknown): Promise<void> {
  const { email } = parse(forgotPasswordSchema, input);
  if (!isEmailConfigured()) {
    // Same answer for every address, so this reveals nothing about accounts.
    throw new AppError("Password reset emails aren't set up on this server yet. Contact the person who runs it.", "CONFLICT");
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, email: true, status: true } });
  if (!user || user.status === "deleted") return;

  const now = Date.now();
  const recent = await db.passwordResetToken.findMany({
    where: { userId: user.id, createdAt: { gt: new Date(now - 60 * 60 * 1000) } },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (recent.length >= MAX_PER_HOUR) return;
  if (recent[0] && now - recent[0].createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000) return;

  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now + RESET_TOKEN_TTL_MINUTES * 60 * 1000) },
  });

  const link = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await sendEmail(resetEmail(user.name, user.email, link));
  } catch (error) {
    // Don't reveal delivery problems for a specific address to the requester; log for the operator.
    console.error("[password-reset] could not send email", error);
  }
}

/** Whether a reset link can still be used (for showing the right page state up front). */
export async function isResetTokenUsable(token: string | undefined): Promise<boolean> {
  if (!token || token.length < 20 || token.length > 200) return false;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { usedAt: true, expiresAt: true },
  });
  return Boolean(row && !row.usedAt && row.expiresAt > new Date());
}

/**
 * Set a new password from a reset link. Single use: consumes every outstanding link for the
 * account and signs out all existing sessions. Returns the user so the caller can sign them in.
 */
export async function resetPassword(input: unknown) {
  const { token, password } = parse(resetPasswordSchema, input);
  const tokenHash = hashToken(token);
  const passwordHash = await hashPassword(password);

  const result = await db.$transaction(async (tx) => {
    // Claim the token atomically so two concurrent submits can't both succeed.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AppError(EXPIRED_MESSAGE, "VALIDATION", { token: EXPIRED_MESSAGE });

    const { userId } = await tx.passwordResetToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    const before = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true, emailVerified: true } });
    if (before.status === "deleted") throw new AppError(EXPIRED_MESSAGE, "VALIDATION", { token: EXPIRED_MESSAGE });
    if (before.status === "placeholder") {
      // An invited person who lost their invite email: the reset link proves the mailbox just as well. Same effect as claiming.
      await tx.emailToken.updateMany({ where: { userId, purpose: "claim_invite", usedAt: null }, data: { usedAt: new Date() } });
    }
    // Following the emailed link proves the address belongs to them. If it was never proven before, someone else may
    // have signed up with it: don't let them keep their payment handles on the account the owner just recovered.
    const unproven = !before.emailVerified;
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        password: passwordHash,
        sessionVersion: { increment: 1 },
        pushSubscriptions: { deleteMany: {} },
        emailVerified: true,
        status: "active",
        ...(unproven ? { venmoHandle: null, paypalMe: null, cashTag: null, upiId: null } : {}),
      },
      select: { id: true, email: true, sessionVersion: true },
    });
    return user;
  });
  await clearLoginThrottle(result.email);
  return result;
}

/** Invalidate outstanding reset links (e.g. after the password is changed from the account page). */
export async function revokeResetTokens(userId: string) {
  await db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
}

function resetEmail(name: string, to: string, link: string) {
  const subject = "Reset your BillSplit password";
  const text = [
    `Hi ${name},`,
    "",
    "Someone asked to reset the password for your BillSplit account. To choose a new one, open this link:",
    "",
    link,
    "",
    `The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes. Setting a new password signs you out on other devices.`,
    "",
    "If you didn't ask for this, you can ignore this email. Your password won't change.",
  ].join("\n");
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const html = `<!doctype html><html><body style="margin:0;background:#f2f5f1;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#13213f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #d3dcd4;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:28px">
<p style="margin:0 0 20px;font-size:18px;font-weight:700">BillSplit</p>
<p style="margin:0 0 12px;font-size:16px;line-height:1.5">Hi ${esc(name)},</p>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5">Someone asked to reset the password for your BillSplit account. Choose a new one with the button below.</p>
<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#13213f;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Choose a new password</a></p>
<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#55627a">The link works once and expires in ${RESET_TOKEN_TTL_MINUTES} minutes. Setting a new password signs you out on other devices.</p>
<p style="margin:0;font-size:14px;line-height:1.5;color:#55627a">If you didn't ask for this, ignore this email. Your password won't change.</p>
</td></tr></table>
<p style="margin:16px 0 0;font-size:12px;color:#55627a">Sent to ${esc(to)}</p>
</td></tr></table></body></html>`;
  return { to, subject, text, html };
}
