"use client";

import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deletePaymentAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DateBlock, LedgerRow, PaymentLabel } from "@/components/ui/ledger";
import { Sheet } from "@/components/ui/sheet";
import { runAction } from "@/lib/client/run-action";
import { formatDay } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";

/**
 * A payment in a ledger: muted "payment" label and plain ink amount, flush with every other row's
 * amount column. Tapping it opens the payment's details, where it can be deleted (with a confirm step).
 */
export function PaymentRow({
  id,
  title,
  note,
  date,
  amountCents,
  currency,
  readOnly = false,
}: {
  id: string;
  /** e.g. "Dev paid you" */
  title: string;
  note?: string | null;
  date: Date | string;
  amountCents: number;
  currency: string;
  /** Archived group: the details open, without Delete payment. */
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await runAction(() => deletePaymentAction(id));
      if (res.ok) {
        toast.success("Payment deleted");
        setConfirming(false);
        setOpen(false);
      } else {
        setError(res.error);
      }
    });
  }

  const amount = formatMoney(amountCents, currency);
  return (
    <li>
      <LedgerRow
        onClick={() => setOpen(true)}
        leading={<DateBlock date={date} />}
        title={title}
        meta={note || undefined}
        trailing={<PaymentLabel cents={amountCents} currency={currency} />}
      />
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Payment"
        description={`${title} ${amount}`}
        footer={
          readOnly ? undefined : (
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden />
              Delete payment
            </Button>
          )
        }
      >
        <dl className="divide-y divide-rule border-y border-rule">
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-body-sm text-ink-muted">Amount</dt>
            <dd className="num font-bold">{amount}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4 py-3">
            <dt className="text-body-sm text-ink-muted">Date</dt>
            <dd className="num">{formatDay(date, { month: "long", day: "numeric", year: "numeric" })}</dd>
          </div>
          {note ? (
            <div className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-body-sm text-ink-muted">Note</dt>
              <dd className="min-w-0 text-right">{note}</dd>
            </div>
          ) : null}
        </dl>
      </Sheet>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !pending && setConfirming(o)}
        title="Delete this payment?"
        body={
          <>
            {title} {amount} on {formatDay(date)}. Deleting it puts that amount back on the balances.
            {error ? (
              <span role="alert" className="mt-3 block font-medium text-owe">
                {error}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Delete payment"
        onConfirm={remove}
        pending={pending}
      />
    </li>
  );
}
