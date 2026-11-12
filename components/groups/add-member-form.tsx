"use client";

import { UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addMemberAction } from "@/app/actions/groups";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { runAction } from "@/lib/client/run-action";

/** Email -> addMemberAction. Shows the service's copy verbatim (e.g. "doesn't have a BillSplit account yet"). */
export function AddMemberForm({ groupId, onAdded, autoFocus }: { groupId: string; onAdded?: () => void; autoFocus?: boolean }) {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [failures, setFailures] = useState(0);
  const formRef = useFocusFirstError(failures);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!email.trim()) {
      setFieldError("Enter their email address.");
      setFailures((n) => n + 1);
      return;
    }
    setFieldError(undefined);
    startTransition(async () => {
      const res = await runAction(() => addMemberAction(groupId, { email: email.trim() }));
      if (res.ok) {
        toast.success("Member added", { description: `${res.data.name} is in the group now.` });
        setEmail("");
        onAdded?.();
      } else {
        setFormError(res.error);
        setFieldError(res.fieldErrors?.email);
        setFailures((n) => n + 1);
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-3">
      <FormError message={formError} />
      <Field label="Email" hint="They need a BillSplit account. We'll add them as a friend too." error={fieldError}>
        {(p) => (
          <Input
            {...p}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={autoFocus}
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </Field>
      <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={pending}>
        <UserPlus aria-hidden />
        {pending ? "Adding…" : "Add member"}
      </Button>
    </form>
  );
}

export function AddMemberSheet({
  open,
  onOpenChange,
  groupId,
  groupName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add member" description={`Add someone to ${groupName} by email.`}>
      <AddMemberForm groupId={groupId} autoFocus onAdded={() => onOpenChange(false)} />
    </Sheet>
  );
}
