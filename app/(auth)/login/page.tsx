import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/auth-forms";
import { safeNextParam, withNext } from "@/components/auth/safe-next";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNextParam((await searchParams).next);
  return (
    <>
      <h1 className="text-heading font-bold">Log in</h1>
      <p className="mt-2 max-w-[34ch] text-body-sm text-ink-muted">
        {next ? "Log in to keep going. We'll take you back to where you were." : "Log what you paid, split it, and see who owes whom."}
      </p>
      <div className="mt-8">
        <LoginForm next={next} />
      </div>
      <p className="mt-6 text-body-sm text-ink-muted">
        New to BillSplit?{" "}
        <Link href={withNext("/register", next)} className="font-semibold text-ink underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </>
  );
}
