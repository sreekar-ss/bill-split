import { jwtVerify, SignJWT } from "jose";

/** Edge/Node-safe session token helpers (used by proxy.ts and server code). */

export const SESSION_COOKIE = "bs_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** Rolling sessions: a session older than this is re-issued (with a fresh 30 days) on the next visit. */
export const SESSION_REFRESH_AFTER_SECONDS = 60 * 60 * 24; // 1 day

/** One place for the cookie's attributes (startSession and the proxy's refresh both use it). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export interface SessionPayload {
  userId: string;
  /** Must match User.sessionVersion; bumping it signs the user out everywhere. */
  v: number;
  /** Seconds since epoch when this token was signed (set on verify). */
  issuedAt?: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/** True when a still-valid session should be re-issued to keep it rolling. */
export function shouldRefreshSession(session: SessionPayload, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return session.issuedAt === undefined || nowSeconds - session.issuedAt > SESSION_REFRESH_AFTER_SECONDS;
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ v: payload.v })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.v !== "number") return null;
    return { userId: payload.sub, v: payload.v, issuedAt: typeof payload.iat === "number" ? payload.iat : undefined };
  } catch {
    return null;
  }
}
