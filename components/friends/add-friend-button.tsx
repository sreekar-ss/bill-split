"use client";

import { UserPlus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { addFriendAction } from "@/app/actions/friends";
import { INVITED_DESCRIPTION, NAME_HINT } from "@/components/groups/add-member-form";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { runAction } from "@/lib/client/run-action";

/** "Add friend" button + its sheet. `defaultOpen` opens it on arrival (e.g. /friends?add=1 from Home). */
export function AddFriendButton({
  variant = "primary",
  defaultOpen = false,
  className,
}: {
  variant?: ButtonProps["variant"];
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const router = useRouter();
  const pathname = usePathname();

  // Drop ?add=1 right away so a refresh, or the re-render after adding, doesn't reopen the sheet.
  useEffect(() => {
    if (defaultOpen) router.replace(pathname, { scroll: false });
  }, [defaultOpen, pathname, router]);

  return (
    <>
      <Button variant={variant} className={className} onClick={() => setOpen(true)}>
        <UserPlus aria-hidden />
        Add friend
      </Button>
      <AddFriendSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function AddFriendSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const formId = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  /** The name field has been revealed (sticky until the sheet is reset). */
  const [askName, setAskName] = useState(false);
  /** The service's "nobody has signed up with that email yet" copy, for the email currently entered. */
  const [noAccount, setNoAccount] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const [failures, setFailures] = useState(0);
  const formRef = useFocusFirstError(failures);

  const reset = () => {
    setEmail("");
    setName("");
    setAskName(false);
    setNoAccount(null);
    setError(null);
    setFieldErrors({});
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (noAccount && !name.trim()) {
      setFieldErrors({ name: "Add their name so everyone knows who this is." });
      setFailures((n) => n + 1);
      return;
    }
    setFieldErrors({});
    startTransition(async () => {
      const result = await runAction(() =>
        addFriendAction({ email: email.trim(), ...(askName && name.trim() ? { name: name.trim() } : {}) }),
      );
      if (result.ok) {
        if (result.data.invited) {
          toast.success(`${result.data.name} invited`, { description: INVITED_DESCRIPTION });
        } else {
          toast.success("Friend added", { description: `${result.data.name} is now in your friends.` });
        }
        reset();
        onOpenChange(false);
      } else if (result.fieldErrors?.name && !noAccount) {
        // We've just heard there's no account for this email: show the name field and move there, without a red error.
        setAskName(true);
        setNoAccount(result.error);
        setFieldErrors({});
        requestAnimationFrame(() => nameRef.current?.focus());
      } else {
        // The service's message is the specific one ("You and Ben are already friends."): show it verbatim, plus any field errors.
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        setFailures((n) => n + 1);
      }
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Add friend"
      description="Add them by email to split expenses with just the two of you. Not on BillSplit yet? We'll invite them."
      footer={
        <Button type="submit" form={formId} className="w-full" disabled={pending || !email.trim()}>
          {noAccount ? (pending ? "Inviting…" : `Invite ${name.trim() || "them"}`) : pending ? "Adding…" : "Add friend"}
        </Button>
      }
    >
      <form ref={formRef} id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" error={fieldErrors.email || undefined}>
          {(p) => (
            <Input
              {...p}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: "" }));
                // The "nobody has signed up" note was about the old email. Keep the name field and what's in it.
                setNoAccount(null);
              }}
              required
              autoFocus
            />
          )}
        </Field>
        {askName ? (
          // The reason is the name field's own hint, so screen readers hear it when focus lands here.
          <Field label="Their name" hint={noAccount ?? NAME_HINT} error={fieldErrors.name || undefined}>
            {(p) => (
              <Input
                {...p}
                ref={nameRef}
                name="name"
                autoComplete="off"
                autoCapitalize="words"
                maxLength={60}
                placeholder="e.g. Maya"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: "" }));
                }}
              />
            )}
          </Field>
        ) : null}
      </form>
    </Sheet>
  );
}
