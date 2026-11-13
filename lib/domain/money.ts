/** All money in the app is integer cents. These helpers convert at the edges only. */

export type Cents = number;

// 2-decimal currencies only (amounts are stored as cents).
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Parse a user-typed amount ("12", "12.5", "1,234.56", "$7.10") into cents.
 * Returns null for anything that isn't a non-negative amount with at most 2 decimals.
 */
export function parseAmountToCents(input: string): Cents | null {
  const cleaned = input.trim().replace(/[\s,$€£₹]/g, "");
  if (!/^\d+(\.\d{0,2})?$|^\.\d{1,2}$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const cents = Number(whole || "0") * 100 + Number((frac + "00").slice(0, 2));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Cents -> "12.50" (no symbol), for prefilling inputs. */
export function centsToInput(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Cents -> "$12.50" using Intl. Uses absolute value when `abs` is set. */
export function formatMoney(cents: Cents, currency: string = "USD", opts: { abs?: boolean } = {}): string {
  const value = (opts.abs ? Math.abs(cents) : cents) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}
