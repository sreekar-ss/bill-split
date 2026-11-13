import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { MAIL_OUTBOX } from "../../playwright.config";

/** One email the E2E server "sent" (a JSON line in MAIL_OUTBOX). */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  headers?: Record<string, string>;
}

/** Every email sent to `to` this run, oldest first. */
export function mailsTo(to: string): Mail[] {
  return readFileSync(MAIL_OUTBOX, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Mail)
    .filter((m) => m.to === to);
}

/**
 * Waits for the email to `to` whose body links to `path` (e.g. "/verify-email"), and returns that
 * link as path + query so it can be opened against the test server. With `after`, only emails
 * beyond the first `after` to that address count (to wait for a *new* one).
 */
export async function linkFor(to: string, path: string, { after = 0 }: { after?: number } = {}): Promise<string> {
  const pattern = new RegExp(`https?://[^\\s"'<>]+${path.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\?token=[\\w%-]+`);
  let link: string | undefined;
  await expect
    .poll(
      () => {
        const mail = mailsTo(to).slice(after).reverse().find((m) => pattern.test(m.text));
        link = mail?.text.match(pattern)?.[0];
        return link;
      },
      { timeout: 10_000, message: `an email to ${to} linking to ${path}` },
    )
    .toBeTruthy();
  const url = new URL(link!);
  return url.pathname + url.search;
}

/**
 * Waits for an email to `to` matching `match` (subject text or predicate) and returns the newest
 * one. With `after`, only emails beyond the first `after` to that address count.
 */
export async function waitForMail(
  to: string,
  match: string | RegExp | ((m: Mail) => boolean),
  { after = 0, timeout = 10_000 }: { after?: number; timeout?: number } = {},
): Promise<Mail> {
  const test =
    typeof match === "function" ? match : (m: Mail) => (typeof match === "string" ? m.subject.includes(match) : match.test(m.subject));
  let found: Mail | undefined;
  await expect
    .poll(
      () => {
        found = mailsTo(to).slice(after).reverse().find(test);
        return Boolean(found);
      },
      { timeout, message: `an email to ${to} matching ${String(match)}` },
    )
    .toBe(true);
  return found!;
}

/** The /unsubscribe link in a notification email's text, as path + query. */
export function unsubscribeLink(mail: Mail): string {
  const link = mail.text.match(/https?:\/\/[^\s"'<>]+\/unsubscribe\?[^\s"'<>]+/)?.[0];
  expect(link, `an unsubscribe link in "${mail.subject}"`).toBeTruthy();
  const url = new URL(link!);
  return url.pathname + url.search;
}

/** The RFC 8058 one-click URL from the List-Unsubscribe header, as path + query. */
export function oneClickLink(mail: Mail): string {
  const header = mail.headers?.["List-Unsubscribe"] ?? "";
  const link = header.match(/<([^>]+)>/)?.[1];
  expect(link, `a List-Unsubscribe header in "${mail.subject}"`).toBeTruthy();
  const url = new URL(link!);
  return url.pathname + url.search;
}
