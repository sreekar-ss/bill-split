import { ChevronLeft } from "lucide-react";
import Link from "next/link";

/** The "‹ Groups" style back link used above page headings (matches the group page). */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="-ml-2.5 mb-1 inline-flex min-h-11 max-w-full items-center gap-0.5 rounded-[10px] pl-0.5 pr-2 text-body-sm font-medium hover:bg-ink/5"
    >
      <ChevronLeft className="size-[22px] shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </Link>
  );
}
