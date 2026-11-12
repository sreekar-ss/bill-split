import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/components/auth/password-reset-forms";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).email;
  const email = typeof raw === "string" && raw.length <= 254 ? raw : "";
  return (
    <>
      <h1 className="text-heading font-bold">Reset your password</h1>
      <p className="mt-2 max-w-[36ch] text-body-sm text-ink-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <div className="mt-8">
        <ForgotPasswordForm defaultEmail={email} />
      </div>
      <p className="mt-6 text-body-sm text-ink-muted">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  );
}
