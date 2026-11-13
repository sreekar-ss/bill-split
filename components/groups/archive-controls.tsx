"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { unarchiveGroupAction } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import { runAction } from "@/lib/client/run-action";

/** Unarchive a group. The action revalidates the app, so the page re-renders as an active group. */
export function useUnarchive(groupId: string, onDone?: () => void) {
  const [pending, startTransition] = useTransition();
  function unarchive() {
    startTransition(async () => {
      const res = await runAction(() => unarchiveGroupAction(groupId));
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Group unarchived", { description: "Everyone in it can add expenses and payments again." });
      onDone?.();
    });
  }
  return { unarchive, pending };
}

/** Shown at the top of an archived group's page, in place of the add/settle actions. */
export function ArchivedBanner({ groupId }: { groupId: string }) {
  const { unarchive, pending } = useUnarchive(groupId, () => {
    // The banner (and its button) goes away: land focus on the page heading instead of <body>.
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>("#main h1");
      if (!target) return;
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  });
  return (
    <section
      aria-label="Archived group"
      className="mb-6 flex max-w-[720px] items-start gap-3 rounded-[10px] border border-rule bg-surface py-1 pl-3 pr-1"
    >
      <Archive className="mt-3 size-[18px] shrink-0 text-ink-muted" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-4">
        <p className="pt-2.5 text-body-sm text-ink md:flex-1 md:py-2.5">
          <span className="font-semibold">Archived.</span> This group is read-only. Unarchive it to add expenses or payments.
        </p>
        {/* -ml-3 lines the icon up with the text above it on mobile. aria-disabled (not disabled)
            keeps focus on the button while it works, and if it fails. */}
        <Button
          variant="ghost"
          className="-ml-3 self-start px-3 aria-disabled:opacity-45 md:ml-0 md:self-auto"
          aria-disabled={pending || undefined}
          onClick={() => !pending && unarchive()}
        >
          <ArchiveRestore aria-hidden />
          {pending ? "Unarchiving…" : "Unarchive"}
        </Button>
      </div>
    </section>
  );
}
