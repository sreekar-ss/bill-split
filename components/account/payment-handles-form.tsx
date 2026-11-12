"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updatePaymentHandlesAction } from "@/app/actions/account";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { runAction } from "@/lib/client/run-action";

type Key = "venmoHandle" | "paypalMe" | "cashTag" | "upiId";
type Handles = Record<Key, string>;

const FIELDS: { key: Key; label: string; placeholder: string; hint: string; prefix?: string }[] = [
  {
    key: "venmoHandle",
    label: "Venmo username",
    placeholder: "ana-lima",
    prefix: "@",
    hint: "Your username, e.g. ana-lima. Shown when you're owed US dollars.",
  },
  {
    key: "paypalMe",
    label: "PayPal.me name",
    placeholder: "anaLima",
    hint: "The part after paypal.me/, e.g. anaLima. Shown for USD, EUR, GBP, CAD and AUD balances.",
  },
  {
    key: "cashTag",
    label: "Cash App $cashtag",
    placeholder: "ana",
    prefix: "$",
    hint: "Your cashtag, e.g. ana. Shown when you're owed US dollars or British pounds.",
  },
  {
    key: "upiId",
    label: "UPI ID",
    placeholder: "ana@okbank",
    hint: "Looks like name@bank, e.g. ana@okbank. Shown when you're owed Indian rupees.",
  },
];

/** Mirrors what the server stores, so the form isn't "dirty" right after a save. */
function normalise(h: Handles): Handles {
  return {
    venmoHandle: h.venmoHandle.trim().replace(/^@/, ""),
    paypalMe: h.paypalMe.trim(),
    cashTag: h.cashTag.trim().replace(/^\$/, ""),
    upiId: h.upiId.trim(),
  };
}

export function PaymentHandlesForm({ initial }: { initial: Handles }) {
  const [saved, setSaved] = useState(initial);
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<{ error: string; fieldErrors: Record<string, string> } | null>(null);
  const formRef = useFocusFirstError(failure);
  const next = normalise(values);
  const dirty = FIELDS.some(({ key }) => next[key] !== saved[key]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const submitted = normalise(values);
    startTransition(async () => {
      const result = await runAction(() => updatePaymentHandlesAction(submitted));
      if (result.ok) {
        setFailure(null);
        setSaved(submitted);
        setValues(submitted);
        toast.success("Payment details saved");
      } else {
        setFailure({ error: result.error, fieldErrors: result.fieldErrors ?? {} });
      }
    });
  }

  const fieldErrors = failure?.fieldErrors ?? {};
  const formError = failure && Object.keys(fieldErrors).length === 0 ? failure.error : null;

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
      {formError ? (
        <div tabIndex={-1} data-form-error className="outline-none">
          <FormError message={formError} />
        </div>
      ) : null}
      {FIELDS.map(({ key, label, placeholder, hint, prefix }) => (
        <Field key={key} label={label} hint={hint} error={fieldErrors[key]}>
          {(p) => (
            <span className="relative flex items-center">
              {prefix ? (
                <span aria-hidden className="pointer-events-none absolute left-3 text-[1rem] text-ink-muted">
                  {prefix}
                </span>
              ) : null}
              <Input
                {...p}
                name={key}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                placeholder={placeholder}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                className={prefix ? "pl-7" : undefined}
              />
            </span>
          )}
        </Field>
      ))}
      <Button type="submit" disabled={pending || !dirty}>
        {pending ? "Saving…" : "Save payment details"}
      </Button>
    </form>
  );
}
