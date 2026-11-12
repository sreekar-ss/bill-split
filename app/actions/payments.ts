"use server";

import { deletePayment, recordPayment } from "@/lib/server/payments";
import type { PaymentInput } from "@/lib/validation";
import { authed } from "./run";

export async function recordPaymentAction(input: PaymentInput) {
  return authed(async (user) => {
    const p = await recordPayment(user.id, input);
    return { id: p.id };
  });
}

export async function deletePaymentAction(paymentId: string) {
  return authed((user) => deletePayment(user.id, paymentId));
}
