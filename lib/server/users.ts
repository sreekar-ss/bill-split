import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginSchema, passwordChangeSchema, profileSchema, registerSchema } from "@/lib/validation";
import { db } from "./db";
import { AppError } from "./errors";
import { sendVerificationEmail } from "./email-tokens";
import { parse } from "./parse";
import { clear, hit, minutesUntil, peek } from "./rate-limit";

/** Request context for throttling (the caller's IP, when known). */
export interface RequestMeta {
  ip?: string | null;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES_PER_EMAIL = 8;
const LOGIN_MAX_FAILURES_PER_IP = 30;
const SIGNUPS_PER_IP_PER_HOUR = 10;
// A real hash (same cost as stored ones) of a random string, so unknown emails take as long as real ones.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(16).toString("hex")));

export async function registerUser(input: unknown, meta: RequestMeta = {}) {
  const data = parse(registerSchema, input);
  if (meta.ip) {
    const { count, resetAt } = await hit(`signup:ip:${meta.ip}`, 60 * 60 * 1000);
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
  const emailKey = `login:email:${data.email}`;
  const ipKey = meta.ip ? `login:ip:${meta.ip}` : null;

  const [byEmail, byIp] = await Promise.all([peek(emailKey), ipKey ? peek(ipKey) : Promise.resolve({ count: 0, resetAt: null })]);
  if (byEmail.count >= LOGIN_MAX_FAILURES_PER_EMAIL || byIp.count >= LOGIN_MAX_FAILURES_PER_IP) {
    const wait = minutesUntil(byEmail.count >= LOGIN_MAX_FAILURES_PER_EMAIL ? byEmail.resetAt : byIp.resetAt);
    throw new AppError(`Too many failed attempts. Try again in ${wait} minute${wait === 1 ? "" : "s"}, or reset your password.`, "RATE_LIMITED");
  }

  const user = await db.user.findUnique({ where: { email: data.email } });
  const usable = user?.status === "active" && user.password.length > 0;
  const ok = await verifyPassword(data.password, usable ? user!.password : await getDummyHash());
  if (!usable || !ok) {
    await Promise.all([hit(emailKey, LOGIN_WINDOW_MS), ipKey ? hit(ipKey, LOGIN_WINDOW_MS) : null]);
    throw new AppError("That email and password don't match an account.", "UNAUTHENTICATED");
  }
  await clear(emailKey);
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
      data: { password: newHash, sessionVersion: { increment: 1 } },
      select: { id: true, sessionVersion: true },
    });
  });
}
