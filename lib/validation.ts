import { z } from "zod";
import { SUPPORTED_CURRENCIES } from "@/lib/domain/money";
import { SPLIT_METHODS } from "@/lib/domain/splits";

/** Shared zod schemas — used by Server Actions (authoritative) and client forms (UX). */

export const EXPENSE_CATEGORIES = [
  "general", "food", "groceries", "transport", "housing", "utilities", "entertainment", "travel", "shopping", "health",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

const id = z.string().min(1).max(64);
const email = z.string().trim().toLowerCase().email("Enter a valid email address.").max(254);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");
const cents = z.number().int().positive("Enter an amount greater than zero.").max(100_000_000_00, "That amount is too large.");

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(60, "Keep your name under 60 characters."),
  email,
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(60),
  defaultCurrency: z.enum(SUPPORTED_CURRENCIES),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "Use at least 8 characters.").max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().min(20, "This reset link is incomplete. Open the link from the email again.").max(200),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

export const claimAccountSchema = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(1, "Enter your name.").max(60, "Keep your name under 60 characters."),
  password: z.string().min(8, "Use at least 8 characters.").max(128),
});

/** Add someone by email. `name` is required only when the email has no account yet (creates an invite). */
export const inviteByEmailSchema = z.object({
  email,
  name: z.string().trim().max(60, "Keep the name under 60 characters.").optional(),
});

const handle = (re: RegExp, msg: string) =>
  z.string().trim().max(64).optional().transform((v) => (v ? v : undefined)).refine((v) => v === undefined || re.test(v), msg);

export const paymentHandlesSchema = z.object({
  venmoHandle: handle(/^@?[A-Za-z0-9_-]{5,30}$/, "Venmo usernames are 5–30 letters, numbers, - or _."),
  paypalMe: handle(/^[A-Za-z0-9]{1,20}$/, "Use just your PayPal.me name, e.g. anaLima."),
  cashTag: handle(/^\$?[A-Za-z][A-Za-z0-9]{0,19}$/, "Cashtags start with a letter, e.g. $ana."),
  upiId: handle(/^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9]{1,64}$/, "UPI IDs look like name@bank."),
});

export const deleteAccountSchema = z.object({
  password: z.string().min(1, "Enter your password to confirm."),
});

export const groupSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name.").max(60, "Keep the name under 60 characters."),
  currency: z.enum(SUPPORTED_CURRENCIES).optional(),
});

export const emailSchema = z.object({ email });

export const expenseSchema = z
  .object({
    groupId: id.optional(),
    friendId: id.optional(),
    description: z.string().trim().min(1, "Describe the expense.").max(100, "Keep the description under 100 characters."),
    amountCents: cents,
    paidById: id,
    date: isoDate,
    category: z.enum(EXPENSE_CATEGORIES).default("general"),
    notes: z.string().trim().max(500).optional(),
    split: z.object({
      method: z.enum(SPLIT_METHODS),
      entries: z.array(z.object({ userId: id, value: z.number().finite().optional() })).min(1, "Choose at least one person to split with."),
    }),
  })
  .refine((v) => Boolean(v.groupId) !== Boolean(v.friendId), { message: "An expense belongs to either a group or a friend." });
export type ExpenseInput = z.input<typeof expenseSchema>;

export const paymentSchema = z
  .object({
    groupId: id.optional(),
    friendId: id.optional(),
    fromUserId: id,
    toUserId: id,
    amountCents: cents,
    /** Direct payments only: the currency of the balance being settled. Group payments use the group's. */
    currency: z.enum(SUPPORTED_CURRENCIES).optional(),
    date: isoDate.optional(),
    note: z.string().trim().max(200).optional(),
  })
  .refine((v) => Boolean(v.groupId) !== Boolean(v.friendId), { message: "A payment belongs to either a group or a friend." })
  .refine((v) => v.fromUserId !== v.toUserId, { message: "Choose two different people." });
export type PaymentInput = z.input<typeof paymentSchema>;

/** Flatten zod issues into { field: message } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
