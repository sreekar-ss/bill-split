import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** 256-bit random, URL-safe token for emailed links. Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set");
  return s;
}

/** Stateless signature with domain separation (e.g. "group-invite"). */
export function sign(purpose: string, payload: string, length = 22): string {
  return createHmac("sha256", secret()).update(`${purpose}\u0000${payload}`).digest("base64url").slice(0, length);
}

export function verifySignature(purpose: string, payload: string, signature: string, length = 22): boolean {
  const expected = Buffer.from(sign(purpose, payload, length));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
