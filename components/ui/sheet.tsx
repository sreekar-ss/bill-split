"use client";

import { Dialog } from "radix-ui";
import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useReturnFocus } from "./return-focus";

/**
 * Bottom sheet on mobile, centred dialog from md up (DESIGN.md → Sheets).
 * Controlled: <Sheet open onOpenChange title="Add expense">…</Sheet>
 *
 * `screen`: on phones it fills the whole screen like a page of its own (Back on the left, the
 * footer pinned to the bottom) instead of a drawer. Used for long forms such as Add expense.
 * Pair it with useBackToClose so the phone's back gesture closes it.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  screen = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  screen?: boolean;
}) {
  const onCloseAutoFocus = useReturnFocus(open);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={cn("animate-fade fixed inset-0 z-50 bg-[#0b1430]/45", screen && "max-md:hidden")} />
        <Dialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className={cn(
            "fixed z-50 flex flex-col bg-surface text-ink",
            screen ? "max-md:animate-screen max-md:inset-0 max-md:h-dvh" : "animate-sheet inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[20px] shadow-lift",
            "md:animate-sheet md:inset-x-auto md:bottom-auto md:left-1/2 md:top-[8vh] md:max-h-[84vh] md:w-[min(560px,calc(100vw-48px))] md:-translate-x-1/2 md:rounded-[20px] md:shadow-lift",
            className,
          )}
        >
          <div
            className={cn(
              "flex items-start justify-between gap-4 border-b border-rule px-4 pb-3 pt-4 md:px-6",
              screen && "max-md:items-center max-md:justify-start max-md:gap-1 max-md:pb-2 max-md:pl-1 max-md:pt-[max(8px,env(safe-area-inset-top))]",
            )}
          >
            {screen ? (
              <Dialog.Close className="grid size-11 shrink-0 place-items-center rounded-[10px] text-ink hover:bg-ink/5 md:hidden" aria-label="Back">
                <ArrowLeft className="size-5" />
              </Dialog.Close>
            ) : null}
            <div className="min-w-0">
              <Dialog.Title className="text-title font-bold">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className={cn("mt-0.5 text-body-sm text-ink-muted", screen && "max-md:truncate")}>{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className={cn("-mr-2 -mt-1 grid size-11 shrink-0 place-items-center rounded-[10px] text-ink-muted hover:bg-ink/5", screen && "max-md:hidden")}
              aria-label="Close"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          {/* Without a footer the body is the bottom edge, so it keeps clear of the home indicator itself. */}
          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pt-4 md:px-6",
              footer ? "pb-4" : "pb-[max(16px,env(safe-area-inset-bottom))]",
            )}
          >
            {children}
          </div>
          {footer ? <div className="border-t border-rule px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-6">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
