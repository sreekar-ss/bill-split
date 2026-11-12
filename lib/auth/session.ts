import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/server/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, signSessionToken, verifySessionToken } from "./token";

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  defaultCurrency: string;
  emailVerified: boolean;
}

export async function startSession(user: { id: string; sessionVersion: number }) {
  const token = await signSessionToken({ userId: user.id, v: user.sessionVersion });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Validates the token signature AND the user's current sessionVersion. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, defaultCurrency: true, sessionVersion: true, status: true, emailVerified: true },
  });
  if (!user || user.status !== "active" || user.sessionVersion !== session.v) return null;
  return { id: user.id, email: user.email, name: user.name, defaultCurrency: user.defaultCurrency, emailVerified: user.emailVerified };
});

/** Use in pages/layouts/actions that need a user. Redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  // Via /logout so a stale cookie (e.g. after a password change elsewhere) is cleared, not looped on.
  if (!user) redirect("/logout");
  return user;
}
