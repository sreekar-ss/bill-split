"use client";

import { Link2, UserPlus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addMemberAction } from "@/app/actions/groups";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { runAction } from "@/lib/client/run-action";

/**
 * Email -> addMemberAction. When the email has no account yet, the service asks for a name
 * (fieldErrors.name): the "Their name" field appears and the next submit sends { email, name },
 * which adds an invited placeholder and emails them. Once shown, the name field stays (with what
 * was typed) while the email is corrected; the server ignores the name when the email has an account.
 * Other errors show the service's copy verbatim.
 */
export function AddMemberForm({ groupId, onAdded, autoFocus }: { groupId: string; onAdded?: () => void; autoFocus?: boolean }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  /** The name field has been revealed (sticky until the form is reset). */
  const [askName, setAskName] = useState(false);
  /** The service's "nobody has signed up with that email yet" copy, for the email currently entered. */
  const [noAccount, setNoAccount] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ email?: string; name?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [failures, setFailures] = useState(0);
  const formRef = useFocusFirstError(failures);
  const nameRef = useRef<HTMLInputElement>(null);

  function fail(next: { email?: string; name?: string }, message: string | null = null) {
    setErrors(next);
    setFormError(message);
    setFailures((n) => n + 1);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!email.trim()) return fail({ email: "Enter their email address." });
    if (noAccount && !name.trim()) return fail({ name: "Add their name so everyone knows who this is." });
    setErrors({});
    startTransition(async () => {
      const input = askName && name.trim() ? { email: email.trim(), name: name.trim() } : { email: email.trim() };
      const res = await runAction(() => addMemberAction(groupId, input));
      if (res.ok) {
        if (res.data.invited) {
          toast.success(`${res.data.name} invited`, { description: INVITED_DESCRIPTION });
        } else {
          toast.success("Member added", { description: `${res.data.name} is in the group now.` });
        }
        setEmail("");
        setName("");
        setAskName(false);
        setNoAccount(null);
        onAdded?.();
        return;
      }
      const fe = res.fieldErrors ?? {};
      if (fe.name && !noAccount) {
        // We've just heard there's no account for this email: show the name field and move there, without a red error.
        setAskName(true);
        setNoAccount(res.error);
        setErrors({});
        setFormError(null);
        requestAnimationFrame(() => nameRef.current?.focus());
        return;
      }
      // The service's message is the specific one ("Ben is already in this group."): show it verbatim, plus any field errors.
      fail({ email: fe.email, name: fe.name }, res.error);
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
      <FormError message={formError} />
      <Field label="Email" hint="We'll add them as a friend too." error={errors.email}>
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
            onChange={(e) => {
              setEmail(e.target.value);
              // The "nobody has signed up" note was about the old email. Keep the name field and what's in it.
              setNoAccount(null);
              if (errors.email) setErrors((x) => ({ ...x, email: undefined }));
            }}
          />
        )}
      </Field>
      {askName ? (
        // The reason is the name field's own hint, so screen readers hear it when focus lands here.
        <Field label="Their name" hint={noAccount ?? NAME_HINT} error={errors.name}>
          {(p) => (
            <Input
              {...p}
              ref={nameRef}
              autoComplete="off"
              autoCapitalize="words"
              maxLength={60}
              placeholder="e.g. Ben"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((x) => ({ ...x, name: undefined }));
              }}
            />
          )}
        </Field>
      ) : null}
      <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={pending}>
        <UserPlus aria-hidden />
        {noAccount ? (pending ? "Inviting…" : `Invite ${name.trim() || "them"}`) : pending ? "Adding…" : "Add member"}
      </Button>
    </form>
  );
}

/** Same words in both "add by email" sheets (members and friends). */
export const INVITED_DESCRIPTION = "We emailed them an invite. You can split expenses with them now.";
export const NAME_HINT = "Everyone sees this name until they join.";

export function AddMemberSheet({
  open,
  onOpenChange,
  groupId,
  groupName,
  onInviteWithLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  /** When given, offers the invite link as an alternative to typing an email. */
  onInviteWithLink?: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add member" description={`Add someone to ${groupName} by email.`}>
      <AddMemberForm groupId={groupId} autoFocus onAdded={() => onOpenChange(false)} />
      {onInviteWithLink ? (
        <div className="mt-6 border-t border-rule pt-5">
          <p className="text-body-sm text-ink-muted">Sharing in a group chat? Send a link anyone can join with.</p>
          <Button variant="secondary" className="mt-3 w-full sm:w-auto" onClick={onInviteWithLink}>
            <Link2 aria-hidden />
            Invite with a link
          </Button>
        </div>
      ) : null}
    </Sheet>
  );
}
