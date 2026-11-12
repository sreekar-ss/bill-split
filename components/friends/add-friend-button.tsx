"use client";

import { UserPlus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { addFriendAction } from "@/app/actions/friends";
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
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [failures, setFailures] = useState(0);
  const formRef = useFocusFirstError(failures);

  const reset = () => {
    setEmail("");
    setError(null);
    setFieldError(undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldError(undefined);
    startTransition(async () => {
      const result = await runAction(() => addFriendAction({ email: email.trim() }));
      if (result.ok) {
        toast.success("Friend added", { description: `${result.data.name} is now in your friends.` });
        reset();
        onOpenChange(false);
      } else {
        setError(result.error);
        setFieldError(result.fieldErrors?.email);
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
      description="They need a BillSplit account. You can then split expenses with just the two of you."
      footer={
        <Button type="submit" form={formId} className="w-full" disabled={pending || !email.trim()}>
          {pending ? "Adding…" : "Add friend"}
        </Button>
      }
    >
      <form ref={formRef} id={formId} onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Email" error={fieldError}>
          {(p) => (
            <Input
              {...p}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="friend@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          )}
        </Field>
      </form>
    </Sheet>
  );
}
