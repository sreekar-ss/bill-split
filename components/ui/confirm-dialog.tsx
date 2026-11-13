"use client";

import { AlertDialog } from "radix-ui";
import { Button } from "./button";
import { useReturnFocus } from "./return-focus";

/** Confirmation step for destructive actions (or, with tone "neutral", for undoable ones like archiving). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  pending,
  tone = "danger",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending?: boolean;
  /** "danger" fills the confirm button with --owe; "neutral" uses the primary ink button. */
  tone?: "danger" | "neutral";
}) {
  const onCloseAutoFocus = useReturnFocus(open);
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[#0b1430]/45" />
        <AlertDialog.Content
          onCloseAutoFocus={onCloseAutoFocus}
          className="animate-sheet fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-surface p-5 text-ink shadow-lift">
          <AlertDialog.Title className="text-title font-bold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-body-sm text-ink-muted">{body}</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">Cancel</Button>
            </AlertDialog.Cancel>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              disabled={pending}
              onClick={(e) => {
                e.preventDefault();
                onConfirm();
              }}
            >
              {pending ? "Working…" : confirmLabel}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
