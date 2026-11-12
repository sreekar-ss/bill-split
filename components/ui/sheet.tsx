"use client";

import { Dialog } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Bottom sheet on mobile, centred dialog from md up (DESIGN.md → Sheets).
 * Controlled: <Sheet open onOpenChange title="Add expense">…</Sheet>
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[#0b1430]/45" />
        <Dialog.Content
          aria-describedby={description ? undefined : undefined}
          className={cn(
            "animate-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[20px] bg-surface text-ink shadow-lift",
            "md:inset-x-auto md:bottom-auto md:left-1/2 md:top-[8vh] md:max-h-[84vh] md:w-[min(560px,calc(100vw-48px))] md:-translate-x-1/2 md:rounded-[20px]",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-rule px-4 pb-3 pt-4 md:px-6">
            <div>
              <Dialog.Title className="text-title font-bold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-body-sm text-ink-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-mr-2 -mt-1 grid size-11 place-items-center rounded-[10px] text-ink-muted hover:bg-ink/5" aria-label="Close">
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">{children}</div>
          {footer ? <div className="border-t border-rule px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
