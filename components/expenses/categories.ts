import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/validation";

/** Friendly, sentence-case labels for the stored category keys. */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  general: "General",
  food: "Food and drink",
  groceries: "Groceries",
  transport: "Transport",
  housing: "Rent and housing",
  utilities: "Utilities",
  entertainment: "Entertainment",
  travel: "Travel",
  shopping: "Shopping",
  health: "Health",
};

export const CATEGORY_OPTIONS = EXPENSE_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

export function categoryLabel(category: string): string {
  return (CATEGORY_LABELS as Record<string, string>)[category] ?? "General";
}

export function isCategory(value: string): value is ExpenseCategory {
  return (EXPENSE_CATEGORIES as readonly string[]).includes(value);
}

/** "$" for USD, "€" for EUR, … (falls back to the code). */
export function currencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat("en-US", { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency");
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** "US dollars", "euros", … for screen-reader labels. */
export function currencyName(currency: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(currency) ?? currency;
  } catch {
    return currency;
  }
}
