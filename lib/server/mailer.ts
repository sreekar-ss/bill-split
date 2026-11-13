import "server-only";
import { appendFile } from "node:fs/promises";
import { hit, peek } from "./rate-limit";

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe for notifications. */
  headers?: Record<string, string>;
}

/**
 * Where email goes:
 * - RESEND_API_KEY set → Resend (https://resend.com), sender EMAIL_FROM.
 * - MAIL_TRANSPORT=file → appended as JSON lines to MAIL_OUTBOX (E2E tests read it).
 * - MAIL_TRANSPORT=memory → kept in `sentEmails` (integration tests).
 * - otherwise, outside production → printed to the server log (local dev).
 * In production with none of these, email is "not configured" and callers must say so.
 */
export const sentEmails: Email[] = [];

type Transport = "resend" | "file" | "memory" | "log" | null;

function transport(): Transport {
  if (process.env.MAIL_TRANSPORT === "memory") return "memory";
  if (process.env.MAIL_TRANSPORT === "file" && process.env.MAIL_OUTBOX) return "file";
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.NODE_ENV !== "production") return "log";
  return null;
}

export function isEmailConfigured(): boolean {
  return transport() !== null;
}

/**
 * Email budget (Resend free plan: 100/day, 3,000/month). "required" emails (sign-up confirmation,
 * password reset, invites) always go out; "optional" ones (reminder fallbacks) are skipped once the
 * day's count reaches EMAIL_OPTIONAL_DAILY_CAP (default 80), leaving room for the required ones.
 * Returns whether the email was sent.
 */
export async function sendEmail(email: Email, { priority = "required" }: { priority?: "required" | "optional" } = {}): Promise<boolean> {
  const day = `email:day:${new Date().toISOString().slice(0, 10)}`;
  if (priority === "optional") {
    const cap = Number(process.env.EMAIL_OPTIONAL_DAILY_CAP ?? 80);
    if ((await peek(day)).count >= cap) {
      console.warn("[mail] daily budget reached; skipped an optional email");
      return false;
    }
  }
  await deliverEmail(email);
  await hit(day, 2 * 86400000).catch(() => {});
  return true;
}

async function deliverEmail(email: Email): Promise<void> {
  switch (transport()) {
    case "memory":
      sentEmails.push(email);
      return;
    case "file":
      await appendFile(process.env.MAIL_OUTBOX!, JSON.stringify({ ...email, sentAt: new Date().toISOString() }) + "\n");
      return;
    case "log":
      console.info(`\n[mail] to=${email.to} subject="${email.subject}"\n${email.text}\n`);
      return;
    case "resend": {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "BillSplit <onboarding@resend.dev>",
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
          ...(email.headers ? { headers: email.headers } : {}),
        }),
      });
      if (!res.ok) throw new Error(`Resend rejected the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return;
    }
    default:
      throw new Error("Email is not configured (set RESEND_API_KEY)");
  }
}
