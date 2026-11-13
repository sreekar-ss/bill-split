import { ChevronLeft } from "lucide-react";
import { AppLink } from "@/components/ui/app-link";

/** The "‹ Groups" style back link used above page headings (matches the group page). */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <AppLink
      href={href}
      className="-ml-2.5 mb-1 inline-flex min-h-11 max-w-full items-center gap-0.5 rounded-[10px] pl-0.5 pr-2 text-body-sm font-medium hover:bg-ink/5"
    >
      <ChevronLeft className="size-[22px] shrink-0" aria-hidden />
      <span className="truncate">{children}</span>
    </AppLink>
  );
}
