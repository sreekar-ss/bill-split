"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resendVerificationAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { runAction } from "@/lib/client/run-action";

/** "Confirmed" with a check, or "Not confirmed" with a button that re-sends the confirmation link. */
export function EmailStatus({ verified, email }: { verified: boolean; email: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (verified) {
    return (
      <p className="mt-1 inline-flex items-center gap-1.5 text-meta font-medium text-ink-muted">
        <CircleCheck className="size-4" aria-hidden />
        Confirmed
      </p>
    );
  }

  function resend() {
    startTransition(async () => {
      const result = await runAction(() => resendVerificationAction());
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.sent) {
        // Confirmed by the live text below (it stays on screen, unlike a toast), so one announcement, not two.
        setSent(true);
      } else {
        toast.error("We already sent you a link. Check your inbox and spam folder, or try again later.");
      }
    });
  }

  return (
    // id: the "Resend the confirmation link" link in the Notifications section jumps here.
    <div id="email-status" className="mt-1 flex scroll-mt-6 flex-wrap items-center gap-x-3 gap-y-1">
      {/* Words carry the state; the money colours (owe/owed) stay reserved for balances. */}
      <p className="inline-flex items-center gap-1.5 text-meta font-medium text-ink">
        <CircleAlert className="size-4 text-ink-muted" aria-hidden />
        Not confirmed
      </p>
      <Button size="sm" variant="secondary" className="h-11" onClick={resend} disabled={pending}>
        {pending ? "Sending…" : "Resend link"}
      </Button>
      <p className="w-full text-meta text-ink-muted" aria-live="polite">
        {sent ? `Sent to ${email}. Open the link in the email to confirm your address.` : "Open the link we emailed you to confirm your address."}
      </p>
    </div>
  );
}
