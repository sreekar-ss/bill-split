import type { Metadata } from "next";
import { ClaimForm, ClaimLinkExpired } from "@/components/auth/claim-form";
import { getCurrentUser } from "@/lib/auth/session";
import { getClaim } from "@/lib/server/email-tokens";

export const metadata: Metadata = { title: "Join BillSplit", referrer: "no-referrer", robots: { index: false } };

/** /invite/accept?token= — an invited placeholder sets a name and password and takes over their history. */
export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const [claim, user] = await Promise.all([getClaim(token), getCurrentUser()]);

  if (!claim) {
    return (
      <>
        <h1 className="text-heading font-bold">This invite link no longer works</h1>
        <div className="mt-8">
          <ClaimLinkExpired />
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-heading font-bold">Join BillSplit</h1>
      <p className="mt-2 max-w-[36ch] text-body-sm text-ink-muted">
        Hi {claim.name}. You&apos;ve been added to shared expenses on BillSplit. Set up your account to see what you&apos;re part of
        and settle up.
      </p>
      {user ? (
        <p className="mt-4 rounded-[10px] border border-rule bg-surface px-3 py-2 text-body-sm text-ink">
          You&apos;re logged in as <span className="font-semibold [overflow-wrap:anywhere]">{user.email}</span>. Setting up this
          account logs you in as <span className="font-semibold [overflow-wrap:anywhere]">{claim.email}</span> instead.
        </p>
      ) : null}
      <div className="mt-8">
        <ClaimForm token={token} email={claim.email} defaultName={claim.name} />
      </div>
    </>
  );
}
