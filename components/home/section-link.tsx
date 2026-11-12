import Link from "next/link";

/** The small "All groups" style link in a section header, with a 44px tap target. */
export function SectionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-my-2 inline-flex min-h-11 items-center rounded-[10px] px-2 text-body-sm font-semibold text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
    >
      {children}
    </Link>
  );
}
