"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { claimAccountAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { splitFailure } from "@/lib/client/run-action";
import { PasswordInput } from "./password-input";
import { useFocusFirstError } from "./use-focus-first-error";

/** Sets up an invited placeholder's account from the emailed link, then lands on Home. */
export function ClaimForm({ token, email, defaultName }: { token: string; email: string; defaultName: string }) {
  const [state, formAction, pending] = useActionState(claimAccountAction, null);
  const [name, setName] = useState(defaultName);
  const [password, setPassword] = useState("");
  const formRef = useFocusFirstError(state);

  const { fieldErrors, formError } = splitFailure(state);
  // The token itself failed (used meanwhile, or expired while the page was open).
  if (fieldErrors.token) return <ClaimLinkExpired message={fieldErrors.token} replacedForm />;

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
      <input type="hidden" name="token" value={token} />
      {formError ? (
        <div tabIndex={-1} data-form-error className="outline-none">
          <FormError message={formError} />
        </div>
      ) : null}
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
      <Field label="Email" hint="You were invited with this address. You'll log in with it.">
        {(p) => (
          <Input {...p} type="email" autoComplete="username" value={email} readOnly className="bg-paper text-ink-muted" />
        )}
      </Field>
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
        {pending ? "Setting up your account…" : "Set up my account"}
      </Button>
    </form>
  );
}

/**
 * Shown when the invite link is invalid, expired or already used. On the server-rendered page the
 * page's h1 already says so. When it replaces the form after a submit (`replacedForm`), the button
 * that had focus is gone, so it brings its own heading, announces itself and takes focus.
 */
export function ClaimLinkExpired({ message, replacedForm = false }: { message?: string; replacedForm?: boolean }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (replacedForm) headingRef.current?.focus();
  }, [replacedForm]);
  return (
    <div role={replacedForm ? "alert" : undefined} className="rounded-[20px] border border-rule bg-surface p-5">
      {replacedForm ? (
        <h2 ref={headingRef} tabIndex={-1} className="mb-2 font-semibold outline-none focus-visible:outline-2 focus-visible:outline-focus">
          This invite link no longer works
        </h2>
      ) : null}
      <p className="text-body-sm text-ink-muted">
        {message ??
          "Invite links work once and expire after 14 days. If you already set up your account, log in. If not, sign up with the email you were invited with and we'll send you a fresh invite link."}
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/login">Log in</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/register">Create an account</Link>
        </Button>
      </div>
    </div>
  );
}
