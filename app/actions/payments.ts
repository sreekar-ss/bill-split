"use server";

import { after } from "next/server";
import { notifyPaymentRecorded } from "@/lib/server/notifications";
import { deletePayment, recordPayment } from "@/lib/server/payments";
import type { PaymentInput } from "@/lib/validation";
import { authed } from "./run";

export async function recordPaymentAction(input: PaymentInput) {
  return authed(async (user) => {
    const p = await recordPayment(user.id, input);
    after(() => notifyPaymentRecorded(p.id, user.id));
    return { id: p.id };
  });
}

export async function deletePaymentAction(paymentId: string) {
  return authed((user) => deletePayment(user.id, paymentId));
}
