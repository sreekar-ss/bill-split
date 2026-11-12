"use client";

import { MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { loginAction, registerAction, resendInviteAction, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { runAction } from "@/lib/client/run-action";
import { PasswordInput } from "./password-input";
import { useFocusFirstError } from "./use-focus-first-error";

function failure(state: AuthFormState) {
  if (!state || state.ok) return { fieldErrors: {} as Record<string, string>, formError: null };
  // Errors without fieldErrors (e.g. RATE_LIMITED lockouts) come back as the form-level message.
  const fieldErrors = state.fieldErrors ?? {};
  // Validation errors repeat the first field message; only show the banner when no field explains it.
  return { fieldErrors, formError: Object.keys(fieldErrors).length > 0 ? null : state.error };
}

function FormBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div tabIndex={-1} data-form-error className="outline-none">
      <FormError message={message} />
    </div>
  );
}

/*
 * Inputs are controlled so React's automatic form reset after an action doesn't wipe
 * what the person typed when the server sends back an error.
 */

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const formRef = useFocusFirstError(state);
  const { fieldErrors, formError } = failure(state);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormBanner message={formError} />
      <Field label="Email" error={fieldErrors.email}>
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
      <Field label="Password" error={fieldErrors.password}>
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
      <div className="-mt-1 flex justify-end">
        <Link
          href={email.trim() ? `/forgot-password?email=${encodeURIComponent(email.trim())}` : "/forgot-password"}
          className="inline-flex h-11 items-center text-body-sm font-semibold underline underline-offset-4"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(registerAction, null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // The email the last submit used, so "Email me the invite again" targets what the server checked.
  const [submittedEmail, setSubmittedEmail] = useState("");
  const formRef = useFocusFirstError(state);
  const { fieldErrors, formError } = failure(state);
  const invitePending = fieldErrors.invite === "pending" && email.trim() === submittedEmail;

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => setSubmittedEmail(email.trim())}
      noValidate
      className="space-y-4"
    >
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <FormBanner message={formError} />
      <Field label="Name" hint="Friends see this on shared expenses." error={fieldErrors.name}>
        {(p) => (
          <Input
            {...p}
            name="name"
            autoComplete="name"
            autoCapitalize="words"
            maxLength={60}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label="Email" hint="Friends add you to groups with this address." error={fieldErrors.email}>
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
      {invitePending ? <ResendInvite key={submittedEmail} email={submittedEmail} /> : null}
      <Field label="Password" hint="At least 8 characters." error={fieldErrors.password}>
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
      <Button type="submit" size="lg" className="mt-2 w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

/** Shown under the email field when it belongs to a pending invite: re-sends the set-up link. */
function ResendInvite({ email }: { email: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: true } | { ok: false; error: string } | null>(null);

  function resend() {
    startTransition(async () => {
      const r = await runAction(() => resendInviteAction(email));
      setResult(r.ok ? { ok: true } : { ok: false, error: r.error });
    });
  }

  if (result?.ok) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-[10px] border border-rule bg-surface px-3 py-2.5 text-body-sm text-ink">
        <MailCheck className="mt-0.5 size-[18px] shrink-0 text-ink-muted" aria-hidden />
        <span>
          We&apos;ve sent a new invite link to <span className="font-semibold [overflow-wrap:anywhere]">{email}</span>. Open it to set up
          your account. Nothing there? Check spam, or wait a minute and try again.
        </span>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <Button variant="secondary" className="w-full" onClick={resend} disabled={pending}>
        {pending ? "Sending invite…" : "Email me the invite again"}
      </Button>
      {result && !result.ok ? <FormError message={result.error} /> : null}
    </div>
  );
}
