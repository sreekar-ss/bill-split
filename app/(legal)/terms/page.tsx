import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED, legalContactEmail } from "@/lib/legal";

export const metadata: Metadata = { title: "Terms of use", description: "The rules for using BillSplit." };

export default function TermsPage() {
  const contact = legalContactEmail();
  return (
    <article>
      <h1 className="text-heading font-bold">Terms of use</h1>
      <p className="text-body-sm text-ink-muted">Last updated {LEGAL_UPDATED}</p>
      <p>By creating an account or using BillSplit, you agree to these terms. They&apos;re written to be read, so here they are in plain words.</p>

      <h2>What BillSplit is</h2>
      <p>
        BillSplit is a tool for recording shared expenses and working out who owes whom. It is not a bank or a payment service: it never
        holds or moves money. Payment links open apps like Venmo or PayPal, and any payment you make there is between you, the other person
        and that app.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Give your real name and an email address you control, and keep your password to yourself.</li>
        <li>You&apos;re responsible for what happens in your account. Tell us straight away if you think someone else got in.</li>
        <li>You must be at least 13 years old to use BillSplit.</li>
      </ul>

      <h2>Balances are records, not bills</h2>
      <p>
        Balances are calculated from what you and the people in your groups enter. Check amounts before you pay. We don&apos;t verify
        expenses, aren&apos;t a party to any arrangement between you and others, and can&apos;t settle disagreements about who owes what.
      </p>

      <h2>Use it fairly</h2>
      <ul>
        <li>Only invite people you know and who would expect to hear from you.</li>
        <li>Don&apos;t use BillSplit to harass anyone, send spam, break the law, or try to access accounts or data that aren&apos;t yours.</li>
        <li>Don&apos;t try to disrupt, overload or reverse-engineer the service.</li>
      </ul>
      <p>We may suspend or close accounts that break these rules.</p>

      <h2>Your content</h2>
      <p>
        What you add stays yours. You give us permission to store it and show it to the people you share it with, only so the app can
        work. The <Link href="/privacy">privacy policy</Link> explains how we handle it.
      </p>

      <h2>Availability and changes</h2>
      <p>
        We work to keep BillSplit running and your data safe, but we provide it &ldquo;as is&rdquo;, without guarantees that it will
        always be available or error-free. We may change or stop features. If we make important changes to these terms, we&apos;ll update
        the date above and let you know.
      </p>

      <h2>Limits of liability</h2>
      <p>
        To the extent the law allows, BillSplit isn&apos;t liable for indirect or consequential losses, or for losses from relying on
        balances, payment links or third-party payment apps. Nothing in these terms limits rights you have under consumer law that
        can&apos;t be limited.
      </p>

      <h2>Ending</h2>
      <p>You can stop using BillSplit and delete your account at any time from Account.</p>

      <h2>Contact</h2>
      <p>
        {contact ? (
          <>Questions about these terms: <a href={`mailto:${contact}`}>{contact}</a>.</>
        ) : (
          <>Questions about these terms: contact the person who runs this BillSplit service.</>
        )}
      </p>
    </article>
  );
}
