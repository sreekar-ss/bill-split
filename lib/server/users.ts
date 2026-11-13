import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginSchema, passwordChangeSchema, profileSchema, registerSchema } from "@/lib/validation";
import { db } from "./db";
import { AppError } from "./errors";
import { sendVerificationEmail } from "./email-tokens";
import { parse } from "./parse";
import { clear, hit, loginKeys, minutesUntil, release } from "./rate-limit";

/** Request context for throttling (the caller's IP, when known). */
export interface RequestMeta {
  ip?: string | null;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES_PER_EMAIL_AND_IP = 8;
const LOGIN_MAX_FAILURES_PER_EMAIL = 50;
const LOGIN_MAX_FAILURES_PER_IP = 30;
/** Requests with no client IP share one budget instead of skipping the per-IP limits. */
const UNKNOWN_IP = "unknown";
const SIGNUPS_PER_IP_PER_HOUR = 10;
// A real hash (same cost as stored ones) of a random string, so unknown emails take as long as real ones.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

export async function registerUser(input: unknown, meta: RequestMeta = {}) {
  const data = parse(registerSchema, input);
  {
    const { count, resetAt } = await hit(`signup:ip:${meta.ip || UNKNOWN_IP}`, 60 * 60 * 1000);
    if (count > SIGNUPS_PER_IP_PER_HOUR) {
      throw new AppError(`Too many new accounts from this network. Try again in ${minutesUntil(resetAt)} minutes.`, "RATE_LIMITED");
    }
  }
  const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true, status: true } });
  if (existing?.status === "placeholder") {
    // Claiming an invited account requires proving the email via the invite link.
    throw new AppError("You've been invited to BillSplit with this email. Use the link in your invite email to set up your account.", "CONFLICT", {
      email: "You've been invited with this email. Check your inbox for the invite link.",
      invite: "pending",
    });
  }
  if (existing) {
    throw new AppError("An account with that email already exists. Log in instead.", "CONFLICT", {
      email: "An account with that email already exists.",
    });
  }
  const user = await db.user.create({
    data: { name: data.name, email: data.email, password: await hashPassword(data.password) },
    select: { id: true, email: true, name: true, sessionVersion: true },
  });
  await sendVerificationEmail(user.id);
  return user;
}

export async function authenticate(input: unknown, meta: RequestMeta = {}) {
  const data = parse(loginSchema, input);
  const keys = loginKeys(data.email, meta.ip || UNKNOWN_IP);

  // Reserve the attempt before checking the password, so a burst of parallel guesses can't all
  // read "under the limit" first. A correct password gives the reservation back.
  const [byEmailIp, byEmail, byIp] = await Promise.all([
    hit(keys.emailIp, LOGIN_WINDOW_MS),
    hit(keys.email, LOGIN_WINDOW_MS),
    hit(keys.ip, LOGIN_WINDOW_MS),
  ]);
  // The lockout is per email *and network*, so someone elsewhere can't lock the owner out just by
  // knowing their email. The per-email ceiling is much higher and only stops spread-out guessing.
  const blockedBy =
    byEmailIp.count > LOGIN_MAX_FAILURES_PER_EMAIL_AND_IP ? byEmailIp
    : byIp.count > LOGIN_MAX_FAILURES_PER_IP ? byIp
    : byEmail.count > LOGIN_MAX_FAILURES_PER_EMAIL ? byEmail
    : null;
  if (blockedBy) {
    const wait = minutesUntil(blockedBy.resetAt);
    throw new AppError(`Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}, or reset your password.`, "RATE_LIMITED");
  }

  const user = await db.user.findUnique({ where: { email: data.email } });
  const usable = user?.status === "active" && user.password.length > 0;
  const ok = await verifyPassword(data.password, usable ? user!.password : await getDummyHash());
  if (!usable || !ok) {
    throw new AppError("That email and password don't match an account.", "UNAUTHENTICATED");
  }
  await Promise.all([clear(keys.emailIp), release(keys.email), release(keys.ip)]);
  return { id: user!.id, email: user!.email, name: user!.name, sessionVersion: user!.sessionVersion };
}

export async function getProfile(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      defaultCurrency: true,
      createdAt: true,
      emailVerified: true,
      venmoHandle: true,
      paypalMe: true,
      cashTag: true,
      upiId: true,
    },
  });
}

export async function updateProfile(userId: string, input: unknown) {
  const data = parse(profileSchema, input);
  return db.user.update({
    where: { id: userId },
    data: { name: data.name, defaultCurrency: data.defaultCurrency },
    select: { id: true, name: true, defaultCurrency: true },
  });
}

/** Changes the password and invalidates every existing session. Returns the user for re-signing in. */
export async function changePassword(userId: string, input: unknown) {
  const data = parse(passwordChangeSchema, input);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(data.currentPassword, user.password))) {
    throw new AppError("Your current password isn't right.", "VALIDATION", { currentPassword: "That isn't your current password." });
  }
  const newHash = await hashPassword(data.newPassword);
  return db.$transaction(async (tx) => {
    // Any reset link emailed before this change must stop working.
    await tx.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
    return tx.user.update({
      where: { id: userId },
      data: { password: newHash, sessionVersion: { increment: 1 }, pushSubscriptions: { deleteMany: {} } },
      select: { id: true, sessionVersion: true },
    });
  });
}
