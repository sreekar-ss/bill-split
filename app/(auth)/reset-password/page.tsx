import type { Metadata } from "next";
import { ResetLinkExpired, ResetPasswordForm } from "@/components/auth/password-reset-forms";
import { isResetTokenUsable } from "@/lib/server/password-reset";

export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).token;
  const token = typeof raw === "string" ? raw : "";
  const usable = await isResetTokenUsable(token);
  return (
    <>
      <h1 className="text-heading font-bold">{usable ? "Choose a new password" : "This link no longer works"}</h1>
      {usable ? (
        <>
          <p className="mt-2 max-w-[36ch] text-body-sm text-ink-muted">
            You&apos;ll be logged in once it&apos;s saved. Other devices will be logged out.
          </p>
          <div className="mt-8">
            <ResetPasswordForm token={token} />
          </div>
        </>
      ) : (
        <div className="mt-8">
          <ResetLinkExpired titled={false} />
        </div>
      )}
    </>
  );
}
