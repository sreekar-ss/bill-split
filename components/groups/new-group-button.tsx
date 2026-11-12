"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { createGroupAction } from "@/app/actions/groups";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { SUPPORTED_CURRENCIES } from "@/lib/domain/money";
import { runAction } from "@/lib/client/run-action";

/** "New group" button + the sheet that creates one, then opens it. */
export function NewGroupButton({ defaultCurrency, variant = "secondary" }: { defaultCurrency: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        New group
      </Button>
      <NewGroupSheet open={open} onOpenChange={setOpen} defaultCurrency={defaultCurrency} />
    </>
  );
}

function NewGroupSheet({ open, onOpenChange, defaultCurrency }: { open: boolean; onOpenChange: (o: boolean) => void; defaultCurrency: string }) {
  const formId = useId();
  const [pending, setPending] = useState(false);
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="New group"
      description="For a trip, a flat or a team."
      footer={
        <Button type="submit" form={formId} size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating…" : "Create group"}
        </Button>
      }
    >
      <NewGroupForm formId={formId} defaultCurrency={defaultCurrency} onPendingChange={setPending} onDone={() => onOpenChange(false)} />
    </Sheet>
  );
}

function NewGroupForm({
  formId,
  defaultCurrency,
  onPendingChange,
  onDone,
}: {
  formId: string;
  defaultCurrency: string;
  onPendingChange: (p: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [failures, setFailures] = useState(0);
  const formRef = useFocusFirstError(failures);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setErrors({ name: "Give the group a name." });
      setFailures((n) => n + 1);
      return;
    }
    setErrors({});
    onPendingChange(true);
    startTransition(async () => {
      const res = await runAction(() => createGroupAction({ name: name.trim(), currency }));
      onPendingChange(false);
      if (res.ok) {
        toast.success("Group created");
        onDone();
        router.push(`/groups/${res.data.id}`);
      } else {
        const fe = res.fieldErrors ?? {};
        setErrors(fe);
        // Field errors show on their field; anything else shows above the form.
        setFormError(fe.name || fe.currency ? null : res.error);
        setFailures((n) => n + 1);
      }
    });
  }

  return (
    <form ref={formRef} id={formId} onSubmit={submit} noValidate className="space-y-4">
      <FormError message={formError} />
      <Field label="Group name" error={errors.name}>
        {(p) => (
          <Input
            {...p}
            autoFocus
            maxLength={60}
            placeholder="e.g. Lisbon trip"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </Field>
      <Field label="Currency" hint="Every amount in this group uses it." error={errors.currency}>
        {(p) => (
          <Select {...p} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </Field>
    </form>
  );
}
