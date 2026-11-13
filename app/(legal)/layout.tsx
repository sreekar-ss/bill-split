import Link from "next/link";

/** Privacy and terms: readable column, wordmark home link, no app chrome (works signed in or out). */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 pb-16 pt-4 md:px-6 md:pt-6">
      <header className="mx-auto flex max-w-[1040px] items-center justify-between gap-4">
        <Link href="/" className="-mx-2 inline-flex h-11 items-center rounded-[10px] px-2 text-title font-bold tracking-tight">
          BillSplit
        </Link>
        <nav aria-label="Legal" className="flex gap-4 text-body-sm">
          <Link href="/privacy" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Privacy</Link>
          <Link href="/terms" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">Terms</Link>
        </nav>
      </header>
      <main id="main" className="legal mx-auto mt-10 w-full max-w-[680px] text-[1.0625rem] leading-relaxed [&_h2]:mt-10 [&_h2]:text-title [&_h2]:font-bold [&_li]:mt-2 [&_p]:mt-4 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:font-semibold [&_a]:underline [&_a]:underline-offset-4">
        {children}
      </main>
    </div>
  );
}
