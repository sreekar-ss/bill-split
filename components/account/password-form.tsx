"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { changePasswordAction } from "@/app/actions/account";
import { PasswordInput } from "@/components/auth/password-input";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { runAction, splitFailure, type ActionFailure } from "@/lib/client/run-action";

export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const formRef = useFocusFirstError(failure);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await runAction(() => changePasswordAction({ currentPassword, newPassword }));
      if (result.ok) {
        setFailure(null);
        setCurrentPassword("");
        setNewPassword("");
        toast.success("Password changed", { description: "You've been logged out on your other devices." });
      } else {
        setFailure(result);
      }
    });
  }

  const { fieldErrors, formError } = splitFailure(failure);

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? (
        <div tabIndex={-1} data-form-error className="outline-none">
          <FormError message={formError} />
        </div>
      ) : null}
      <Field label="Current password" error={fieldErrors.currentPassword}>
        {(p) => (
          <PasswordInput
            {...p}
            name="currentPassword"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="New password" hint="At least 8 characters." error={fieldErrors.newPassword}>
        {(p) => (
          <PasswordInput
            {...p}
            name="newPassword"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="secondary" disabled={pending || !currentPassword || !newPassword}>
        {pending ? "Changing password…" : "Change password"}
      </Button>
    </form>
  );
}
