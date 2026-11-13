"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { resendVerificationAction } from "@/app/actions/account";
import { runAction } from "@/lib/client/run-action";

export const LINK_SENT = "Link sent";
export const LINK_THROTTLED = "We already sent you a link. Check your inbox and spam folder, or try again later.";

/**
 * Re-sends the signed-in user's verification link and toasts the outcome.
 * `sent` becomes true once a fresh link has gone out (false when throttled or failed).
 */
export function useResendVerification() {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  function resend() {
    startTransition(async () => {
      const result = await runAction(() => resendVerificationAction());
      if (!result.ok) {
        toast.error(result.error);
      } else if (result.data.sent) {
        setSent(true);
        toast.success(LINK_SENT);
      } else {
        toast(LINK_THROTTLED);
      }
    });
  }

  return { resend, pending, sent };
}
