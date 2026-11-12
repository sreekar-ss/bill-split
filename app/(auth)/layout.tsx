import Link from "next/link";

/** Signed-out pages: wordmark on top, one narrow column, no app chrome. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh px-4 pb-12 pt-4 md:px-6 md:pt-6">
      <header className="mx-auto flex max-w-[1040px] items-center">
        <Link href="/" className="-mx-2 inline-flex h-11 items-center rounded-[10px] px-2 text-title font-bold tracking-tight">
          BillSplit
        </Link>
      </header>
      <main id="main" className="mx-auto mt-10 w-full max-w-[400px] md:mt-[12vh]">
        {children}
      </main>
    </div>
  );
}
