import "server-only";
import { hashPassword } from "@/lib/auth/password";
import { claimAccountSchema } from "@/lib/validation";
import { appUrl } from "./app-url";
import { db } from "./db";
import { renderEmail } from "./email-template";
import { AppError } from "./errors";
import { isEmailConfigured, sendEmail } from "./mailer";
import { parse } from "./parse";
import { hashToken, newToken } from "./tokens";

export type EmailTokenPurpose = "verify_email" | "claim_invite";

const TTL_HOURS: Record<EmailTokenPurpose, number> = { verify_email: 48, claim_invite: 24 * 14 };
/** Minimum gap between two emails of the same purpose to the same account. */
const COOLDOWN_SECONDS = 60;

async function issue(userId: string, purpose: EmailTokenPurpose): Promise<string | null> {
  const last = await db.emailToken.findFirst({ where: { userId, purpose }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last && Date.now() - last.createdAt.getTime() < COOLDOWN_SECONDS * 1000) return null;
  const token = newToken();
  await db.emailToken.create({
    data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_HOURS[purpose] * 3600_000) },
  });
  return token;
}

async function deliver(email: Parameters<typeof sendEmail>[0]) {
  if (!isEmailConfigured()) return;
  try {
    await sendEmail(email);
  } catch (error) {
    console.error("[email] could not send", error);
  }
}

// ── Verify email ────────────────────────────────────────────────────────────────────────────

/** Sends (or re-sends, after a cooldown) the verification link. Returns false when throttled. */
export async function sendVerificationEmail(userId: string): Promise<boolean> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, name: true, emailVerified: true, status: true } });
  if (user.emailVerified || user.status !== "active") return true;
  const token = await issue(userId, "verify_email");
  if (!token) return false;
  await deliver(
    renderEmail({
      to: user.email,
      subject: "Confirm your email for BillSplit",
      greeting: `Hi ${user.name},`,
      paragraphs: ["Confirm this is your email address so friends can find you and you get updates about shared expenses."],
      button: { label: "Confirm my email", url: `${appUrl()}/verify-email?token=${encodeURIComponent(token)}` },
      notes: [`The link expires in ${TTL_HOURS.verify_email} hours.`, "If you didn't create a BillSplit account, ignore this email."],
    }),
  );
  return true;
}

/** Marks the email verified. Returns the user id, or null for an invalid/expired/used link. */
export async function verifyEmail(token: string | undefined): Promise<string | null> {
  if (!token || token.length > 200) return null;
  const tokenHash = hashToken(token);
  return db.$transaction(async (tx) => {
    const claimed = await tx.emailToken.updateMany({
      where: { tokenHash, purpose: "verify_email", usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const { userId } = await tx.emailToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    await tx.user.update({ where: { id: userId }, data: { emailVerified: true } });
    return userId;
  });
}

// ── Claim an invited placeholder ────────────────────────────────────────────────────────────

/**
 * Emails a placeholder their "set up your account" link. `context` is e.g. "Ana added you to Lisbon trip".
 * Returns false when throttled.
 */
export async function sendClaimInvite(placeholderId: string, context: string): Promise<boolean> {
  const user = await db.user.findUniqueOrThrow({ where: { id: placeholderId }, select: { email: true, name: true, status: true } });
  if (user.status !== "placeholder") return true;
  const token = await issue(placeholderId, "claim_invite");
  if (!token) return false;
  await deliver(
    renderEmail({
      to: user.email,
      subject: `${context} on BillSplit`,
      greeting: `Hi ${user.name},`,
      paragraphs: [
        `${context} on BillSplit, an app for splitting shared costs and keeping track of who owes whom.`,
        "Set up your account to see the expenses you're part of and settle up.",
      ],
      button: { label: "Set up my account", url: `${appUrl()}/invite/accept?token=${encodeURIComponent(token)}` },
      notes: ["The link works once and expires in 14 days.", "Not expecting this? You can ignore this email."],
    }),
  );
  return true;
}

/** What the claim page needs to show, or null when the link can't be used. */
export async function getClaim(token: string | undefined) {
  if (!token || token.length > 200) return null;
  const row = await db.emailToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { purpose: true, usedAt: true, expiresAt: true, user: { select: { email: true, name: true, status: true } } },
  });
  if (!row || row.purpose !== "claim_invite" || row.usedAt || row.expiresAt <= new Date() || row.user.status !== "placeholder") return null;
  return { email: row.user.email, name: row.user.name };
}

/** Turns the placeholder into a real, verified account (keeping all its history). */
export async function claimAccount(input: unknown) {
  const data = parse(claimAccountSchema, input);
  const tokenHash = hashToken(data.token);
  const passwordHash = await hashPassword(data.password);
  return db.$transaction(async (tx) => {
    const claimed = await tx.emailToken.updateMany({
      where: { tokenHash, purpose: "claim_invite", usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    const message = "This invite link has expired or was already used. Ask for a new invite, or request one on the sign-up page.";
    if (claimed.count !== 1) throw new AppError(message, "VALIDATION", { token: message });
    const { userId } = await tx.emailToken.findUniqueOrThrow({ where: { tokenHash }, select: { userId: true } });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } });
    if (user.status !== "placeholder") throw new AppError(message, "VALIDATION", { token: message });
    await tx.emailToken.updateMany({ where: { userId, purpose: "claim_invite", usedAt: null }, data: { usedAt: new Date() } });
    return tx.user.update({
      where: { id: userId },
      data: { name: data.name, password: passwordHash, status: "active", emailVerified: true, sessionVersion: { increment: 1 } },
      select: { id: true, email: true, name: true, sessionVersion: true },
    });
  });
}

/** From the sign-up page: someone with an invited email asks for a fresh claim link. Never reveals anything. */
export async function resendClaimForEmail(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, status: true } });
  if (user?.status === "placeholder") await sendClaimInvite(user.id, "You've been invited to split expenses");
}
