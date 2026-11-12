import "server-only";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { loginSchema, passwordChangeSchema, profileSchema, registerSchema } from "@/lib/validation";
import { db } from "./db";
import { AppError } from "./errors";
import { parse } from "./parse";

export async function registerUser(input: unknown) {
  const data = parse(registerSchema, input);
  const existing = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (existing) {
    throw new AppError("An account with that email already exists. Log in instead.", "CONFLICT", {
      email: "An account with that email already exists.",
    });
  }
  return db.user.create({
    data: { name: data.name, email: data.email, password: await hashPassword(data.password) },
    select: { id: true, email: true, name: true, sessionVersion: true },
  });
}

export async function authenticate(input: unknown) {
  const data = parse(loginSchema, input);
  const user = await db.user.findUnique({ where: { email: data.email } });
  if (!user || !(await verifyPassword(data.password, user.password))) {
    throw new AppError("That email and password don't match an account.", "UNAUTHENTICATED");
  }
  return { id: user.id, email: user.email, name: user.name, sessionVersion: user.sessionVersion };
}

export async function getProfile(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, email: true, name: true, defaultCurrency: true, createdAt: true },
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
