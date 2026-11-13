"use client";

import { Trash2 } from "lucide-react";
import { AlertDialog } from "radix-ui";
import { useState, useTransition } from "react";
import { deleteAccountAction } from "@/app/actions/account";
import { PasswordInput } from "@/components/auth/password-input";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { useReturnFocus } from "@/components/ui/return-focus";
import { runAction } from "@/lib/client/run-action";

/**
 * Destructive confirm with a password field. Same look as ConfirmDialog, which can't hold a form
 * (its body renders inside the dialog's description paragraph). On success the action ends the
 * session and redirects to "/?deleted=1".
 */
export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ error: string; fieldErrors: Record<string, string> } | null>(null);
  const formRef = useFocusFirstError(failure);
  const onCloseAutoFocus = useReturnFocus(open);

  function onOpenChange(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) {
      setPassword("");
      setFailure(null);
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await runAction(() => deleteAccountAction({ password }));
      if (result && !result.ok) setFailure({ error: result.error, fieldErrors: result.fieldErrors ?? {} });
    });
  }

  const fieldErrors = failure?.fieldErrors ?? {};
  const formError = failure && Object.keys(fieldErrors).length === 0 ? failure.error : null;

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden />
        Delete account
      </Button>
      <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[#0b1430]/45" />
          <AlertDialog.Content
            onCloseAutoFocus={onCloseAutoFocus}
            onOpenAutoFocus={(e) => {
              // Land on the password field: it's the one thing to do here.
              const input = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLInputElement>('input[name="password"]');
              if (input) {
                e.preventDefault();
                input.focus();
              }
            }}
            className="animate-sheet fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-32px)] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[20px] bg-surface p-5 text-ink shadow-lift"
          >
            <AlertDialog.Title className="text-title font-bold">Delete your account?</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-body-sm text-ink-muted">
              This can&apos;t be undone. Your login, profile and payment details are removed, and you leave every group. Expenses you
              shared stay in your friends&apos; history, with your name shown as &ldquo;Deleted user&rdquo;.
            </AlertDialog.Description>
            <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
              {formError ? (
                <div tabIndex={-1} data-form-error className="outline-none">
                  <FormError message={formError} />
                </div>
              ) : null}
              <Field label="Password" hint="Enter your password to confirm." error={fieldErrors.password}>
                {(p) => (
                  <PasswordInput
                    {...p}
                    name="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <AlertDialog.Cancel asChild>
                  <Button variant="secondary" className="w-full sm:w-auto" disabled={pending}>
                    Cancel
                  </Button>
                </AlertDialog.Cancel>
                <Button type="submit" variant="danger" className="w-full sm:w-auto" disabled={pending || !password}>
                  {pending ? "Deleting account…" : "Delete account"}
                </Button>
              </div>
            </form>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}
