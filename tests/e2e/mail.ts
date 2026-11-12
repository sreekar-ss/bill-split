import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";
import { MAIL_OUTBOX } from "../../playwright.config";

/** One email the E2E server "sent" (a JSON line in MAIL_OUTBOX). */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
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
