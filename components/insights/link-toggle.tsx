import { AppLink } from "@/components/ui/app-link";
import { cn } from "@/lib/utils/cn";

/**
 * A segmented control made of links, for choices kept in the URL (period, currency). It looks like
 * components/ui/segmented.tsx; the current option carries aria-current, so it's not colour alone.
 */
export function LinkToggle({
  label,
  options,
  className,
}: {
  label: string;
  options: { href: string; label: string; current: boolean; srLabel?: string }[];
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-grid auto-cols-fr grid-flow-col rounded-[10px] border border-field bg-paper p-1", className)}>
      {options.map((o) => (
        <AppLink
          key={o.href}
          href={o.href}
          scroll={false}
          replace
          aria-current={o.current ? "true" : undefined}
          className={cn(
            "inline-flex h-11 items-center justify-center whitespace-nowrap rounded-[7px] px-3 text-body-sm font-semibold text-ink-muted hover:text-ink",
            o.current && "bg-surface text-ink ring-2 ring-inset ring-ink",
          )}
        >
          {o.srLabel ? (
            <>
              <span aria-hidden>{o.label}</span>
              <span className="sr-only">{o.srLabel}</span>
            </>
          ) : (
            o.label
          )}
        </AppLink>
      ))}
    </div>
  );
}
