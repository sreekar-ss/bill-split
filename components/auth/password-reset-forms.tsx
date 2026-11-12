"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { forgotPasswordAction, resetPasswordAction, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { PasswordInput } from "./password-input";
import { useFocusFirstError } from "./use-focus-first-error";

function failure(state: AuthFormState) {
  if (!state || state.ok) return { fieldErrors: {} as Record<string, string>, formError: null };
  const fieldErrors = state.fieldErrors ?? {};
  return { fieldErrors, formError: Object.keys(fieldErrors).some((k) => k !== "token") ? null : state.error };
}

export function ForgotPasswordForm({ defaultEmail = "" }: { defaultEmail?: string }) {
  const [state, formAction, pending] = useActionState(forgotPasswordAction, null);
  const [email, setEmail] = useState(defaultEmail);
  const formRef = useFocusFirstError(state && !state.ok ? state : null);
  const { fieldErrors, formError } = failure(state);

  if (state?.ok) {
    return (
      <div role="status" className="rounded-[20px] border border-rule bg-surface p-5">
        <MailCheck className="size-6 text-owed" aria-hidden />
        <h2 className="mt-3 text-title font-bold">Check your email</h2>
        <p className="mt-2 text-body-sm text-ink-muted">
          If <span className="font-semibold text-ink">{email.trim()}</span> has a BillSplit account, we&apos;ve sent it a link to
          choose a new password. The link expires in 30 minutes.
        </p>
        <p className="mt-3 text-body-sm text-ink-muted">Nothing there? Check spam, or wait a minute and send it again.</p>
        <Link href="/login" className="mt-4 inline-flex h-11 items-center font-semibold underline underline-offset-4">
          Back to log in
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
      {formError ? (
        <div tabIndex={-1} data-form-error className="outline-none">
          <FormError message={formError} />
        </div>
      ) : null}
      <Field label="Email" hint="The address you log in with." error={fieldErrors.email}>
        {(p) => (
          <Input
            {...p}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
        {pending ? "Sending link…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const formRef = useFocusFirstError(state && !state.ok ? state : confirmError);
  const { fieldErrors, formError } = failure(state);
  const expired = Boolean(state && !state.ok && state.fieldErrors?.token);

  if (expired) return <ResetLinkExpired />;

  return (
    <form
      ref={formRef}
      action={formAction}
      noValidate
      onSubmit={(e) => {
        if (password !== confirm) {
          e.preventDefault();
          setConfirmError("The two passwords don't match.");
        } else {
          setConfirmError(null);
        }
      }}
      className="space-y-4"
    >
      <input type="hidden" name="token" value={token} />
      {formError ? (
        <div tabIndex={-1} data-form-error className="outline-none">
          <FormError message={formError} />
        </div>
      ) : null}
      <Field label="New password" hint="At least 8 characters." error={fieldErrors.password}>
        {(p) => (
          <PasswordInput
            {...p}
            name="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </Field>
      <Field label="Confirm new password" error={confirmError ?? undefined}>
        {(p) => (
          <PasswordInput
            {...p}
            autoComplete="new-password"
            maxLength={128}
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}

/** `titled={false}` when the page heading already says the link no longer works. */
export function ResetLinkExpired({ titled = true }: { titled?: boolean }) {
  return (
    <div role="alert" className="rounded-[20px] border border-rule bg-surface p-5">
      {titled ? <h2 className="mb-2 text-title font-bold">This link no longer works</h2> : null}
      <p className="text-body-sm text-ink-muted">
        Reset links expire after 30 minutes and work only once. Request a new one and use the newest email.
      </p>
      <Button asChild className="mt-4">
        <Link href="/forgot-password">Send a new link</Link>
      </Button>
    </div>
  );
}
