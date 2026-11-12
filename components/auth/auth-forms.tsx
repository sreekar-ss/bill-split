"use client";

import { useActionState, useState } from "react";
import { loginAction, registerAction, type AuthFormState } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { PasswordInput } from "./password-input";
import { useFocusFirstError } from "./use-focus-first-error";

function failure(state: AuthFormState) {
  if (!state || state.ok) return { fieldErrors: {} as Record<string, string>, formError: null };
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
  const formRef = useFocusFirstError(state);
  const { fieldErrors, formError } = failure(state);

  return (
    <form ref={formRef} action={formAction} noValidate className="space-y-4">
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
