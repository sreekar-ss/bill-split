import type { Metadata } from "next";
import Link from "next/link";
import { UnsubscribeConfirm } from "@/components/notifications/unsubscribe-confirm";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyUnsubscribe, type NotificationType } from "@/lib/server/notifications";

export const metadata: Metadata = { title: "Unsubscribe", referrer: "no-referrer", robots: { index: false } };

const COPY: Record<NotificationType, { title: string; body: string; confirmLabel: string }> = {
  expenses: {
    title: "Stop emails about expenses?",
    body: "You won't get an email when someone adds an expense with you. The expenses still show up in BillSplit.",
    confirmLabel: "Stop expense emails",
  },
  payments: {
    title: "Stop emails about payments?",
    body: "You won't get an email when someone records a payment with you. Payments still show up in BillSplit.",
    confirmLabel: "Stop payment emails",
  },
  reminders: {
    title: "Stop reminder emails?",
    body: "You won't get an email when someone reminds you about money you owe them.",
    confirmLabel: "Stop reminder emails",
  },
  digest: {
    title: "Stop the weekly summary?",
    body: "You won't get the Monday email with your balances.",
    confirmLabel: "Stop the weekly summary",
  },
};

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

/*
 * Verifies the signed link but changes nothing on GET: mail scanners prefetch links, so the actual
 * unsubscribe waits for the button (a Server Action POST). Mail providers' one-click POST goes to /api/unsubscribe.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const u = one(q.u);
  const t = one(q.t);
  const s = one(q.s);

  if (u && s && verifyUnsubscribe(u, t, s)) {
    return <UnsubscribeConfirm u={u} t={t} s={s} {...COPY[t]} />;
  }

  const user = await getCurrentUser();
  return (
    <>
      <h1 className="text-heading font-bold">This unsubscribe link doesn&apos;t work</h1>
      <div className="mt-8 rounded-[20px] border border-rule bg-surface p-5">
        <p className="text-body-sm text-ink-muted">
          Part of the link may have been cut off when it was copied. Open it again from the email, or choose which emails you get in
          Account, under Email notifications.
          {user ? null : " Log in first to get there."}
        </p>
        <Button asChild className="mt-4">
          {user ? <Link href="/account#notifications">Open email settings</Link> : <Link href="/login?next=%2Faccount">Log in</Link>}
        </Button>
      </div>
    </>
  );
}
