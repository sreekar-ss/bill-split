"use client";

import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { unsubscribeAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { runAction } from "@/lib/client/run-action";

/**
 * The /unsubscribe question and its answer. Nothing changes until the button is pressed: mail
 * scanners open links on their own, so the page itself (a GET) must never unsubscribe anyone.
 */
export function UnsubscribeConfirm({
  u,
  t,
  s,
  title,
  body,
  confirmLabel,
}: {
  u: string;
  t: string;
  s: string;
  title: string;
  body: string;
  /** Says what the button does, e.g. "Stop expense emails". */
  confirmLabel: string;
}) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const doneHeading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // The button that had focus is gone after success; move focus to the new heading.
  useEffect(() => {
    if (done) doneHeading.current?.focus();
  }, [done]);

  function confirm() {
    startTransition(async () => {
      const result = await runAction(() => unsubscribeAction({ u, t, s }));
      if (result.ok) {
        setError(null);
        setDone(true);
      } else {
        setError(result.error);
        requestAnimationFrame(() => errorRef.current?.querySelector<HTMLElement>("[data-form-error]")?.focus());
      }
    });
  }

  if (done) {
    return (
      <>
        <CircleCheck className="size-7 text-ink-muted" aria-hidden />
        <h1 ref={doneHeading} tabIndex={-1} className="mt-3 text-heading font-bold outline-none">
          Unsubscribed
        </h1>
        <p className="mt-2 max-w-[36ch] text-body-sm text-ink-muted">
          You won&apos;t get these emails any more. You can turn them back on in Account.
        </p>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link href="/account#notifications">Go to Account</Link>
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-heading font-bold">{title}</h1>
      <p className="mt-2 max-w-[40ch] text-body-sm text-ink-muted">{body}</p>
      <div ref={errorRef} className="mt-6 empty:hidden">
        {error ? <FormError message={error} /> : null}
      </div>
      <Button size="lg" className="mt-8 w-full" onClick={confirm} disabled={pending}>
        {pending ? "Stopping…" : confirmLabel}
      </Button>
      <p className="mt-6 text-body-sm text-ink-muted">
        Changed your mind? Close this page and nothing changes. To choose exactly which emails you get, go to{" "}
        <Link href="/account#notifications" className="font-semibold text-ink underline underline-offset-4">
          Account
        </Link>
        .
      </p>
    </>
  );
}
