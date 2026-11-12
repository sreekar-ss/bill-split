"use client";

import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResendVerification } from "./use-resend-verification";

/** "Send a new link" on the expired verify-email page (signed-in, unverified). */
export function VerifyEmailResend({ email }: { email: string }) {
  const { resend, pending, sent } = useResendVerification();

  if (sent) {
    return (
      <p role="status" className="mt-4 flex items-start gap-2 text-body-sm text-ink">
        <MailCheck className="mt-0.5 size-[18px] shrink-0 text-owed" aria-hidden />
        <span>
          Link sent to <span className="font-semibold [overflow-wrap:anywhere]">{email}</span>. Open the newest email to confirm.
        </span>
      </p>
    );
  }

  return (
    <Button className="mt-4" onClick={resend} disabled={pending}>
      {pending ? "Sending link…" : "Send a new link"}
    </Button>
  );
}
