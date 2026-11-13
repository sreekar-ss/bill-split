"use server";

import { after } from "next/server";
import { NOTIFY_PER_MINUTE, notifyPaymentRecorded } from "@/lib/server/notifications";
import { deletePayment, recordPayment } from "@/lib/server/payments";
import { hit } from "@/lib/server/rate-limit";
import type { PaymentInput } from "@/lib/validation";
import { authed } from "./run";

export async function recordPaymentAction(input: PaymentInput) {
  return authed(async (user) => {
    const p = await recordPayment(user.id, input);
    // Only the notification is limited (shared with new expenses): the payment is already saved either way.
    after(async () => {
      const { count } = await hit(`notify:${user.id}`, 60_000);
      if (count <= NOTIFY_PER_MINUTE) await notifyPaymentRecorded(p.id, user.id);
    });
    return { id: p.id };
  });
}

export async function deletePaymentAction(paymentId: string) {
  return authed((user) => deletePayment(user.id, paymentId));
}
