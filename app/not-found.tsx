import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/** Unmatched URLs. Rendered without the app shell, so it works signed in or out. */
export default function NotFound() {
  return (
    <div className="min-h-dvh px-4 pb-12 pt-4 md:px-6 md:pt-6">
      <header className="mx-auto flex max-w-[1040px] items-center">
        <Link href="/" className="-mx-2 inline-flex h-11 items-center rounded-[10px] px-2 text-title font-bold tracking-tight">
          BillSplit
        </Link>
      </header>
      <main id="main" className="mx-auto mt-10 w-full max-w-[400px] md:mt-[12vh]">
        <p className="num text-hero font-bold leading-none tracking-[-0.02em] text-ink-muted">404</p>
        <h1 className="mt-4 text-heading font-bold">There&apos;s no page here</h1>
        <p className="mt-2 text-body-sm text-ink-muted">The link may be mistyped or out of date. Your balances are where you left them.</p>
        <Button asChild size="lg" className="mt-6">
          <Link href="/">Go to BillSplit</Link>
        </Button>
      </main>
    </div>
  );
}
