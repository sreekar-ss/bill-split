"use client";

// CONTRACT (used by group and friend pages). Keep these props stable; new ones stay optional.
import { ExternalLink } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { recordPaymentAction } from "@/app/actions/payments";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { todayInput } from "@/lib/domain/dates";
import { centsToInput, formatMoney, parseAmountToCents } from "@/lib/domain/money";
import { paymentLinks, type PaymentHandles } from "@/lib/domain/payment-links";
import { cn } from "@/lib/utils/cn";
import type { PaymentInput } from "@/lib/validation";
import { runAction } from "@/lib/client/run-action";
import { displayName, isInvited, type PersonStatus } from "@/lib/utils/person";

/**
 * Someone who can pay or receive. `status` and the payment handles are optional so older callers
 * that pass only {id, name} keep working; without handles the sheet just records the payment.
 */
export type SettleUpPerson = { id: string; name: string; status?: PersonStatus | null } & PaymentHandles;

export interface SettleUpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where the payment is recorded: a group, or directly with a friend. */
  context: { groupId: string } | { friendId: string };
  /** People who can be payer/receiver (group members, or [me, friend]). */
  people: SettleUpPerson[];
  meId: string;
  currency: string;
  /** Prefill, usually from the settle-up plan. Amount may be edited (partial payments are fine). */
  defaultFromId?: string;
  defaultToId?: string;
  defaultAmountCents?: number;
  /** Prefilled note in the payment app, e.g. the group name. Defaults to "BillSplit". */
  paymentNote?: string;
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
  paymentNote,
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

  const personOf = (id: string) => people.find((p) => p.id === id);
  const nameOf = (id: string, start: boolean) => {
    if (id === meId) return start ? "You" : "you";
    const person = personOf(id);
    return person ? displayName(person) : "Someone";
  };
  const optionLabel = (p: SettleUpPerson) => (p.id === meId ? "You" : displayName(p));

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

  // Payment links only help when you're the one paying someone else.
  const payee = fromId === meId && toId !== meId ? personOf(toId) : undefined;

  return (
    <div className="space-y-4">
      {payee ? <PayWith payee={payee} amountCents={cents} currency={currency} note={paymentNote?.trim() || "BillSplit"} /> : null}
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
    </div>
  );
}

const hasHandle = (p: PaymentHandles) => Boolean(p.venmoHandle || p.paypalMe || p.cashTag || p.upiId);

/**
 * "Pay Ben $42.00 with [Venmo] [PayPal]": deep links into the payee's payment apps with the amount and
 * note filled in. BillSplit never moves money, so the person records the payment below afterwards.
 */
function PayWith({
  payee,
  amountCents,
  currency,
  note,
}: {
  payee: SettleUpPerson;
  amountCents: number | null;
  currency: string;
  note: string;
}) {
  const headingId = useId();
  const name = displayName(payee);

  if (!hasHandle(payee)) {
    // Handles are also hidden until the payee has dealt with you (see handle-sharing.ts), so don't claim they have none.
    return (
      <p className="text-body-sm text-ink-muted">
        {isInvited(payee)
          ? `${payee.name} hasn't joined yet, so there's no payment app to link. Pay them another way, then record it here.`
          : `${name} hasn't shared a payment app with you yet. Pay them another way, then record it here.`}
      </p>
    );
  }

  // Which apps work for this currency doesn't depend on the amount, so this also drives the prompts below.
  const available = paymentLinks(payee, 100, currency, note);
  if (available.length === 0) {
    return (
      <p className="text-body-sm text-ink-muted">
        {name}&apos;s payment apps don&apos;t take {currency}. Pay them another way, then record it here.
      </p>
    );
  }

  const links = amountCents ? paymentLinks(payee, amountCents, currency, note) : [];

  return (
    <section aria-labelledby={headingId} className="rounded-[10px] border border-rule px-3.5 py-3">
      {links.length ? (
        <>
          <h3 id={headingId} className="text-body-sm font-semibold">
            Pay {name} <span className="num">{formatMoney(amountCents!, currency)}</span> with
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {links.map((link) => {
              // Custom schemes (upi://) hand off to an app; a new tab would just be left blank.
              const web = link.url.startsWith("https://");
              return (
                <li key={link.method}>
                  <a
                    href={link.url}
                    target={web ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "secondary" })}
                  >
                    {/* The visible label stays short; the link's name says who gets paid and how much. */}
                    <span className="sr-only">
                      Pay {name} {formatMoney(amountCents!, currency)} with{" "}
                    </span>
                    {link.label}
                    {web ? (
                      <>
                        <ExternalLink aria-hidden />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </>
                    ) : null}
                  </a>
                </li>
              );
            })}
          </ul>
          <p className="mt-2.5 text-meta text-ink-muted">After paying, record it here so balances update.</p>
        </>
      ) : (
        <p id={headingId} className="text-body-sm text-ink-muted">
          Enter an amount below to pay {name} with {listFormat(available.map((l) => l.label))}.
        </p>
      )}
    </section>
  );
}

function listFormat(items: string[]) {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}
