"use client";

// CONTRACT (owned by the groups feature; also used by friends pages). Keep these props stable.
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordPaymentAction } from "@/app/actions/payments";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { todayInput } from "@/lib/domain/dates";
import { centsToInput, formatMoney, parseAmountToCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";
import type { PaymentInput } from "@/lib/validation";
import { runAction } from "@/lib/client/run-action";

export interface SettleUpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the payment is recorded: a group, or directly with a friend. */
  context: { groupId: string } | { friendId: string };
  /** People who can be payer/receiver (group members, or [me, friend]). */
  people: { id: string; name: string }[];
  meId: string;
  currency: string;
  /** Prefill, usually from the settle-up plan. Amount may be edited (partial payments are fine). */
  defaultFromId?: string;
  defaultToId?: string;
  defaultAmountCents?: number;
}

export function SettleUpSheet(props: SettleUpSheetProps) {
  const { open, onOpenChange } = props;
  const formId = useId();
  const [pending, setPending] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Settle up"
      description="Record money that changed hands. Partial amounts are fine."
      footer={
        <Button type="submit" form={formId} size="lg" className="w-full" disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
      }
    >
      {/* The sheet's content unmounts when closed, so the form starts fresh (and re-reads defaults) on every open. */}
      <SettleUpForm {...props} formId={formId} onPendingChange={setPending} />
    </Sheet>
  );
}

function currencySymbol(currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

function SettleUpForm({
  onOpenChange,
  context,
  people,
  meId,
  currency,
  defaultFromId,
  defaultToId,
  defaultAmountCents,
  formId,
  onPendingChange,
}: SettleUpSheetProps & { formId: string; onPendingChange: (pending: boolean) => void }) {
  const firstOther = people.find((p) => p.id !== meId)?.id ?? people[0]?.id ?? "";
  const initialFrom = defaultFromId ?? meId;
  const initialTo = defaultToId ?? (initialFrom === firstOther ? meId : firstOther);

  const [fromId, setFromId] = useState(initialFrom);
  const [toId, setToId] = useState(initialTo);
  const [amount, setAmount] = useState(defaultAmountCents ? centsToInput(defaultAmountCents) : "");
  const [date, setDate] = useState(() => todayInput());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Bumped on every failed submit so focus moves to the first problem, even when it's the same one again.
  const [failures, setFailures] = useState(0);
  const formRef = useFocusFirstError(failures);

  const nameOf = (id: string, start: boolean) => (id === meId ? (start ? "You" : "you") : (people.find((p) => p.id === id)?.name ?? "Someone"));
  const optionLabel = (p: { id: string; name: string }) => (p.id === meId ? "You" : p.name);

  // Picking the same person on both sides swaps them instead, so payer and receiver always differ.
  const chooseFrom = (id: string) => {
    if (id === toId) setToId(fromId);
    setFromId(id);
    setErrors((e) => ({ ...e, fromUserId: "", toUserId: "" }));
  };
  const chooseTo = (id: string) => {
    if (id === fromId) setFromId(toId);
    setToId(id);
    setErrors((e) => ({ ...e, fromUserId: "", toUserId: "" }));
  };

  const cents = parseAmountToCents(amount);
  const preview = cents && fromId && toId && fromId !== toId ? `${nameOf(fromId, true)} paid ${nameOf(toId, false)} ${formatMoney(cents, currency)}` : null;

  const hint = defaultAmountCents ? `Full balance is ${formatMoney(defaultAmountCents, currency)}. Paying part of it? Change the amount.` : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    if (!cents) next.amountCents = "Enter an amount greater than zero.";
    if (fromId === toId) next.toUserId = "Choose two different people.";
    if (!date) next.date = "Choose a date.";
    if (Object.keys(next).length) {
      setErrors(next);
      setFailures((n) => n + 1);
      return;
    }
    setErrors({});
    onPendingChange(true);
    startTransition(async () => {
      const res = await runAction(() =>
        recordPaymentAction({
          ...context,
          // A direct balance can be in any currency; say which one this payment settles.
          ...("friendId" in context ? { currency: currency as PaymentInput["currency"] } : {}),
          fromUserId: fromId,
          toUserId: toId,
          amountCents: cents!,
          date,
          note: note.trim() || undefined,
        }),
      );
      onPendingChange(false);
      if (res.ok) {
        toast.success("Payment recorded");
        onOpenChange(false);
      } else {
        setFormError(res.error);
        setErrors(res.fieldErrors ?? {});
        setFailures((n) => n + 1);
      }
    });
  }

  const symbol = currencySymbol(currency);

  return (
    <form ref={formRef} id={formId} onSubmit={submit} noValidate className="space-y-4" aria-busy={pending}>
      <FormError message={formError} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" error={errors.fromUserId || undefined}>
          {(p) => (
            <Select {...p} value={fromId} onChange={(e) => chooseFrom(e.target.value)}>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {optionLabel(person)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="To" error={errors.toUserId || undefined}>
          {(p) => (
            <Select {...p} value={toId} onChange={(e) => chooseTo(e.target.value)}>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {optionLabel(person)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>

      <Field label="Amount" hint={hint} error={errors.amountCents || undefined}>
        {(p) => (
          <div
            className={cn(
              "flex h-16 items-center rounded-[10px] border border-field bg-surface px-3.5 focus-within:outline-2 focus-within:outline-focus",
              p["aria-invalid"] && "border-owe",
            )}
          >
            <span aria-hidden className="mr-1 text-heading font-semibold text-ink-muted">
              {symbol}
            </span>
            <input
              {...p}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (errors.amountCents) setErrors((er) => ({ ...er, amountCents: "" }));
              }}
              className="num w-full min-w-0 bg-transparent text-[2rem] font-bold tracking-[-0.02em] text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
        )}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Date" error={errors.date || undefined}>
          {(p) => <Input {...p} type="date" className="num" value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="Note (optional)" error={errors.note || undefined}>
          {(p) => <Input {...p} maxLength={200} placeholder="e.g. Bank transfer" value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>

      <p aria-live="polite" className="rounded-[10px] bg-paper px-3.5 py-3 text-body-sm">
        {preview ? (
          <span className="font-semibold">{preview}</span>
        ) : (
          <span className="text-ink-muted">Enter an amount to see the payment.</span>
        )}
      </p>
    </form>
  );
}
