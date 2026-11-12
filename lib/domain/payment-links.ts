import { centsToInput, type Cents } from "./money";

/**
 * Deep links that open a payment app with the amount and note filled in. BillSplit never moves
 * money; after paying, the person taps "Record payment". Only methods that support the currency
 * are offered.
 */
export interface PaymentHandles {
  venmoHandle?: string | null;
  paypalMe?: string | null;
  cashTag?: string | null;
  upiId?: string | null;
}

export interface PaymentLink {
  method: "venmo" | "paypal" | "cashapp" | "upi";
  label: string;
  url: string;
}

const PAYPAL_CURRENCIES = new Set(["USD", "EUR", "GBP", "CAD", "AUD"]);

export function paymentLinks(
  payee: PaymentHandles & { name: string },
  amountCents: Cents,
  currency: string,
  note: string,
): PaymentLink[] {
  if (amountCents <= 0) return [];
  const amount = centsToInput(amountCents);
  const memo = note.slice(0, 80);
  const links: PaymentLink[] = [];

  if (payee.venmoHandle && currency === "USD") {
    const recipient = payee.venmoHandle.replace(/^@/, "");
    const q = new URLSearchParams({ txn: "pay", recipients: recipient, amount, note: memo });
    links.push({ method: "venmo", label: "Venmo", url: `https://venmo.com/?${q}` });
  }
  if (payee.paypalMe && PAYPAL_CURRENCIES.has(currency)) {
    links.push({ method: "paypal", label: "PayPal", url: `https://paypal.me/${encodeURIComponent(payee.paypalMe)}/${amount}${currency}` });
  }
  if (payee.cashTag && (currency === "USD" || currency === "GBP")) {
    const tag = payee.cashTag.replace(/^\$/, "");
    links.push({ method: "cashapp", label: "Cash App", url: `https://cash.app/$${encodeURIComponent(tag)}/${amount}` });
  }
  if (payee.upiId && currency === "INR") {
    const q = new URLSearchParams({ pa: payee.upiId, pn: payee.name, am: amount, cu: "INR", tn: memo });
    links.push({ method: "upi", label: "UPI", url: `upi://pay?${q}` });
  }
  return links;
}
