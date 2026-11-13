import type { Metadata } from "next";
import Link from "next/link";
import { LEGAL_UPDATED, legalContactEmail } from "@/lib/legal";

export const metadata: Metadata = { title: "Privacy policy", description: "What BillSplit collects, why, who can see it, and how to get it or delete it." };

export default function PrivacyPage() {
  const contact = legalContactEmail();
  return (
    <article>
      <h1 className="text-heading font-bold">Privacy policy</h1>
      <p className="text-body-sm text-ink-muted">Last updated {LEGAL_UPDATED}</p>
      <p>
        BillSplit helps you keep track of shared costs with friends and groups. This page explains what we store, why, who can see it and
        how you can get a copy or delete it. In short: we keep what the app needs to work, we don&apos;t show ads, we don&apos;t track you
        around the web, and we never sell your data.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account:</strong> name, email address and a securely hashed password (we can&apos;t read your password).</li>
        <li><strong>What you add:</strong> groups, members, expenses (descriptions, amounts, dates, categories, notes, how they&apos;re split), payments and recurring schedules. Other people in your groups can add these too.</li>
        <li><strong>People you invite:</strong> when you add someone by email who doesn&apos;t have an account, we store the name and email you give us and send them one invitation.</li>
        <li><strong>Payment details you choose to add:</strong> Venmo, PayPal.me, Cash App or UPI handles. We only use them to build payment links; BillSplit never moves money.</li>
        <li><strong>Notification settings and devices:</strong> which emails you want and, if you turn on push notifications, a technical address for each device you enable.</li>
        <li><strong>Security data:</strong> your IP address, used briefly to limit repeated sign-in and sign-up attempts, and standard server logs kept by our hosting provider.</li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        We use one essential cookie to keep you logged in. Your browser also remembers a few preferences on your device: your theme choice
        and whether you dismissed the &ldquo;install the app&rdquo; prompt. There are no advertising or analytics cookies.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To run the app: show balances, work out who owes whom, and keep your groups in sync.</li>
        <li>To send the emails and notifications you&apos;ve asked for (you can turn each kind off in Account) and essential ones like password resets.</li>
        <li>To keep the service secure and prevent abuse.</li>
      </ul>

      <h2>Who can see your information</h2>
      <ul>
        <li>People in your groups see your name, your email and the expenses and payments in those groups. Friends see what you share directly with them.</li>
        <li>Your payment handles are shown only to people you share expenses with, when they settle up with you.</li>
        <li>Nobody else. We don&apos;t sell or rent personal data and we don&apos;t share it for advertising.</li>
      </ul>

      <h2>Services that process data for us</h2>
      <ul>
        <li><strong>Vercel</strong> hosts the app.</li>
        <li><strong>Neon</strong> stores the database.</li>
        <li><strong>Resend</strong> sends our emails.</li>
        <li>If you turn on push notifications, your device&apos;s push service (<strong>Apple</strong>, <strong>Google</strong>, <strong>Mozilla</strong> or <strong>Microsoft</strong>) delivers them. The message content is encrypted so only your device can read it.</li>
      </ul>
      <p>These providers may process data in the United States and other countries, under their own security and privacy commitments.</p>

      <h2>How long we keep it</h2>
      <p>
        We keep your data while your account exists. When you delete your account, we remove your name, email, password, payment handles,
        devices and memberships. Expenses you shared with others stay in their history, shown as &ldquo;Deleted user&rdquo;, so their
        balances still add up. Database backups made for safe updates are kept for a limited time and then deleted.
      </p>

      <h2>Your choices and rights</h2>
      <ul>
        <li><strong>Get a copy:</strong> Account → Your data → Download my data gives you everything as a file.</li>
        <li><strong>Correct it:</strong> change your name, email preferences and payment details in Account.</li>
        <li><strong>Delete it:</strong> Account → Delete account (settle up first).</li>
        <li><strong>Stop emails:</strong> every notification email has an unsubscribe link, and Account has a switch for each kind.</li>
      </ul>
      <p>
        Depending on where you live (for example the EU, UK or California), you may have further rights, such as to object to processing
        or to complain to your data protection authority.{" "}
        {contact ? (
          <>Contact us at <a href={`mailto:${contact}`}>{contact}</a> for any privacy request.</>
        ) : (
          <>Contact the person who runs this BillSplit service for any privacy request.</>
        )}
      </p>

      <h2>Children</h2>
      <p>BillSplit isn&apos;t meant for children under 13, and we don&apos;t knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we&apos;ll update the date above, and tell you in the app or by email if the change matters.</p>

      <p className="mt-10 text-body-sm text-ink-muted">
        See also the <Link href="/terms">terms of use</Link>.
      </p>
    </article>
  );
}
