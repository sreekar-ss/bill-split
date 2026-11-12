import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { VerifyEmailResend } from "@/components/auth/verify-email-resend";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyEmail } from "@/lib/server/email-tokens";

export const metadata: Metadata = { title: "Confirm your email", referrer: "no-referrer", robots: { index: false } };

/*
 * Verifying on GET is deliberate: a link scanner that opens the link first just confirms the
 * address early. A later visit then finds the token already used, so a signed-in, already-verified person
 * is shown the confirmed state rather than an error.
 */
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : undefined;
  const verifiedUserId = await verifyEmail(token);
  // Read after verifying so emailVerified reflects this request.
  const user = await getCurrentUser();
  const confirmed = verifiedUserId !== null || Boolean(user?.emailVerified);

  if (confirmed) {
    const email = user && (verifiedUserId === null || verifiedUserId === user.id) ? user.email : null;
    return (
      <>
        <CircleCheck className="size-7 text-ink-muted" aria-hidden />
        <h1 className="mt-3 text-heading font-bold">Email confirmed</h1>
        <p className="mt-2 max-w-[36ch] text-body-sm text-ink-muted">
          {email ? (
            <>
              Thanks. Friends can now find you and add you to groups with{" "}
              <span className="font-semibold text-ink [overflow-wrap:anywhere]">{email}</span>.
            </>
          ) : (
            "Thanks. Friends can now find you and add you to groups with this address."
          )}
        </p>
        <Button asChild size="lg" className="mt-8 w-full">
          {user ? <Link href="/home">Go to Home</Link> : <Link href="/login">Log in</Link>}
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-heading font-bold">This link no longer works</h1>
      <div className="mt-8 rounded-[20px] border border-rule bg-surface p-5">
        <p className="text-body-sm text-ink-muted">
          Confirmation links expire after 48 hours and work only once.{" "}
          {user ? (
            <>
              Send a new one to <span className="font-semibold text-ink [overflow-wrap:anywhere]">{user.email}</span> and use the
              newest email.
            </>
          ) : (
            "If you already confirmed your email, you're all set. If not, log in and choose Resend link at the top of the page."
          )}
        </p>
        {user ? (
          <VerifyEmailResend email={user.email} />
        ) : (
          <Button asChild className="mt-4">
            <Link href="/login">Log in</Link>
          </Button>
        )}
      </div>
      {user ? (
        <p className="mt-6 text-body-sm text-ink-muted">
          <Link href="/home" className="font-semibold text-ink underline underline-offset-4">
            Back to Home
          </Link>
        </p>
      ) : null}
    </>
  );
}
