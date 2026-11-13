import type { Metadata } from "next";
import Link from "next/link";
import { RegisterForm } from "@/components/auth/auth-forms";
import { safeNextParam, withNext } from "@/components/auth/safe-next";

export const metadata: Metadata = { title: "Create an account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNextParam((await searchParams).next);
  return (
    <>
      <h1 className="text-heading font-bold">Create an account</h1>
      <p className="mt-2 max-w-[36ch] text-body-sm text-ink-muted">
        Start a group for the flat or the trip, add people by email, and keep a running tally of who owes whom.
      </p>
      <div className="mt-8">
        <RegisterForm next={next} />
      </div>
      <p className="mt-4 text-meta text-ink-muted">
        By creating an account you agree to the{" "}
        <Link href="/terms" className="font-semibold text-ink underline underline-offset-4">terms of use</Link> and{" "}
        <Link href="/privacy" className="font-semibold text-ink underline underline-offset-4">privacy policy</Link>.
      </p>
      <p className="mt-6 text-body-sm text-ink-muted">
        Already have an account?{" "}
        <Link href={withNext("/login", next)} className="font-semibold text-ink underline underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  );
}
