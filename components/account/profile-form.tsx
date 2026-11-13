"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProfileAction } from "@/app/actions/account";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { SUPPORTED_CURRENCIES } from "@/lib/domain/money";
import { runAction, splitFailure, type ActionFailure } from "@/lib/client/run-action";

const CURRENCY_NAMES: Record<(typeof SUPPORTED_CURRENCIES)[number], string> = {
  USD: "US dollar",
  EUR: "Euro",
  GBP: "British pound",
  INR: "Indian rupee",
  CAD: "Canadian dollar",
  AUD: "Australian dollar",
};

export function ProfileForm({ name: initialName, email, defaultCurrency }: { name: string; email: string; defaultCurrency: string }) {
  const [name, setName] = useState(initialName);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<ActionFailure | null>(null);
  const formRef = useFocusFirstError(failure);
  const dirty = name.trim() !== initialName || currency !== defaultCurrency;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const result = await runAction(() => updateProfileAction({ name, defaultCurrency: currency }));
      if (result.ok) {
        setFailure(null);
        setName((n) => n.trim());
        toast.success("Changes saved");
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
      <Field label="Name" hint="Friends see this on shared expenses." error={fieldErrors.name}>
        {(p) => (
          <Input {...p} name="name" autoComplete="name" maxLength={60} required value={name} onChange={(e) => setName(e.target.value)} />
        )}
      </Field>
      <Field label="Email" hint="You log in with this address. It can't be changed yet.">
        {(p) => <Input {...p} type="email" value={email} readOnly className="bg-paper text-ink-muted" />}
      </Field>
      <Field label="Default currency" hint="New groups and expenses start in this currency." error={fieldErrors.defaultCurrency}>
        {(p) => (
          <Select {...p} name="defaultCurrency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}, {CURRENCY_NAMES[c]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
