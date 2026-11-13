import { CATEGORY_LABELS, isCategory } from "@/components/expenses/categories";
import { formatDay, fromDateInput } from "@/lib/domain/dates";
import { centsToInput, parseAmountToCents, type Cents } from "@/lib/domain/money";
import type { SearchFilters } from "@/lib/server/search";
import type { ExpenseCategory } from "@/lib/validation";

/**
 * Activity search/filter state, as it lives in the URL (`/activity?q=taxi&group=…&paid=me&min=10`).
 * Shared by the server page (first render) and the client island (typing, filters, "Show more").
 * Anything malformed in the URL is dropped rather than erroring.
 */
export type PaidBy = "me" | "others";

export interface ActivityFilters {
  q?: string;
  groupId?: string;
  friendId?: string;
  category?: ExpenseCategory;
  /** yyyy-mm-dd */
  from?: string;
  /** yyyy-mm-dd */
  to?: string;
  paidBy?: PaidBy;
  minCents?: Cents;
  maxCents?: Cents;
}

export type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

export const SEARCH_MAX_LENGTH = 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function get(src: ParamSource, key: string): string | undefined {
  const raw = src instanceof URLSearchParams ? src.get(key) : src[key];
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  return value ? value : undefined;
}

function id(value: string | undefined) {
  return value && value.length <= 64 ? value : undefined;
}

export function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && ISO_DATE.test(value) && !Number.isNaN(fromDateInput(value).getTime()));
}

function amount(value: string | undefined) {
  if (!value) return undefined;
  const cents = parseAmountToCents(value);
  return cents === null ? undefined : cents;
}

export function parseFilters(src: ParamSource): ActivityFilters {
  const category = get(src, "category");
  const paid = get(src, "paid");
  const from = get(src, "from");
  const to = get(src, "to");
  const f: ActivityFilters = {
    q: get(src, "q")?.slice(0, SEARCH_MAX_LENGTH).trim() || undefined,
    groupId: id(get(src, "group")),
    friendId: id(get(src, "friend")),
    category: category && isCategory(category) ? category : undefined,
    from: isIsoDate(from) ? from : undefined,
    to: isIsoDate(to) ? to : undefined,
    paidBy: paid === "me" || paid === "others" ? paid : undefined,
    minCents: amount(get(src, "min")),
    maxCents: amount(get(src, "max")),
  };
  return f;
}

/** "12" for 1200, "12.5" for 1250: short and still parseable by parseAmountToCents. */
export function centsToParam(cents: Cents): string {
  const whole = Math.floor(cents / 100);
  const frac = cents % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

/** "12" for 1200, "12.50" for 1250: for chips and prefilled inputs (no currency, since results can mix them). */
export function amountLabel(cents: Cents): string {
  return cents % 100 === 0 ? String(cents / 100) : centsToInput(cents);
}

/** Canonical query string (fixed key order, no empty values). "" means no search or filter is active. */
export function filtersToQuery(f: ActivityFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.groupId) p.set("group", f.groupId);
  if (f.friendId) p.set("friend", f.friendId);
  if (f.category) p.set("category", f.category);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.paidBy) p.set("paid", f.paidBy);
  if (f.minCents !== undefined) p.set("min", centsToParam(f.minCents));
  if (f.maxCents !== undefined) p.set("max", centsToParam(f.maxCents));
  return p.toString();
}

export function filtersFromQuery(query: string): ActivityFilters {
  return parseFilters(new URLSearchParams(query));
}

/** The input for searchExpenses / searchExpensesAction. */
export function toSearchInput(f: ActivityFilters, page: number): SearchFilters {
  return { ...f, page };
}

export type FilterKey = Exclude<keyof ActivityFilters, "q">;

export interface FilterOption {
  id: string;
  label: string;
}

/** One entry per active filter (not the text search), for the removable chips under the search box. */
export function describeFilters(
  f: ActivityFilters,
  options: { groups: FilterOption[]; friends: FilterOption[] },
): { key: FilterKey; label: string }[] {
  const out: { key: FilterKey; label: string }[] = [];
  if (f.groupId) out.push({ key: "groupId", label: options.groups.find((g) => g.id === f.groupId)?.label ?? "One group" });
  if (f.friendId) {
    const name = options.friends.find((p) => p.id === f.friendId)?.label;
    out.push({ key: "friendId", label: name ? `With ${name}` : "With one friend" });
  }
  if (f.category) out.push({ key: "category", label: CATEGORY_LABELS[f.category] });
  const day = (d: string) => formatDay(fromDateInput(d), { month: "short", day: "numeric", year: "numeric" });
  if (f.from) out.push({ key: "from", label: `From ${day(f.from)}` });
  if (f.to) out.push({ key: "to", label: `Until ${day(f.to)}` });
  if (f.paidBy) out.push({ key: "paidBy", label: f.paidBy === "me" ? "Paid by you" : "Paid by others" });
  if (f.minCents !== undefined) out.push({ key: "minCents", label: `At least ${amountLabel(f.minCents)}` });
  if (f.maxCents !== undefined) out.push({ key: "maxCents", label: `At most ${amountLabel(f.maxCents)}` });
  return out;
}
