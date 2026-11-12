import { formatMoney, parseAmountToCents, type Cents } from "@/lib/domain/money";
import { computeShares, type SplitEntry, type SplitMethod } from "@/lib/domain/splits";

/** What the person typed for each method, kept separately so switching methods doesn't lose input. */
export interface SplitDraft {
  method: SplitMethod;
  /** userId → included in the split (the row checkbox). */
  included: Record<string, boolean>;
  /** userId → typed text, per non-equal method. */
  exact: Record<string, string>;
  percentage: Record<string, string>;
  shares: Record<string, string>;
}

export type ValueMethod = Exclude<SplitMethod, "equal">;

export interface SplitStatus {
  tone: "ok" | "error" | "muted";
  message: string;
  detail?: string;
}

export interface SplitEvaluation {
  /** Entries in the shape ExpenseInput.split.entries expects (exact = cents, percentage = %, shares = weight). */
  entries: SplitEntry[];
  /** Live per-person amount, when it can be worked out. */
  preview: Map<string, Cents>;
  /** userIds whose typed value can't be read. */
  invalid: Set<string>;
  status: SplitStatus;
  valid: boolean;
}

const DECIMAL = /^\d+(\.\d{0,2})?$|^\.\d{1,2}$/;

/** Parse a typed number with up to two decimals. Blank → 0, unreadable → null. */
export function parseDecimal(text: string): number | null {
  const t = text.trim();
  if (t === "") return 0;
  if (!DECIMAL.test(t)) return null;
  return Number(t);
}

function parseValue(method: ValueMethod, text: string): number | null {
  if (method === "exact") return text.trim() === "" ? 0 : parseAmountToCents(text);
  return parseDecimal(text);
}

function formatPercent(bp: number) {
  return `${(bp / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

function formatWeight(n: number) {
  return String(Math.round(n * 100) / 100);
}

export function emptyDraft(participantIds: string[], method: SplitMethod = "equal"): SplitDraft {
  const included: Record<string, boolean> = {};
  const shares: Record<string, string> = {};
  for (const id of participantIds) {
    included[id] = true;
    shares[id] = "1";
  }
  return { method, included, exact: {}, percentage: {}, shares };
}

/**
 * Work out the split from the draft. Uses computeShares (the same function the server uses), so a
 * split this says is valid will be accepted.
 */
export function evaluateSplit({
  amountCents,
  draft,
  participantIds,
  paidById,
  currency,
}: {
  amountCents: Cents | null;
  draft: SplitDraft;
  participantIds: string[];
  paidById: string;
  currency: string;
}): SplitEvaluation {
  const money = (c: Cents) => formatMoney(c, currency);
  const { method } = draft;
  const included = participantIds.filter((id) => draft.included[id]);
  const invalid = new Set<string>();
  const preview = new Map<string, Cents>();

  const entries: SplitEntry[] =
    method === "equal"
      ? included.map((userId) => ({ userId }))
      : included.map((userId) => {
          const value = parseValue(method, draft[method][userId] ?? "");
          if (value === null) invalid.add(userId);
          return { userId, value: value ?? 0 };
        });

  const result = (status: SplitStatus, valid = false): SplitEvaluation => ({ entries, preview, invalid, status, valid });

  if (included.length === 0) {
    return result({ tone: "error", message: "Choose at least one person to split with." });
  }
  if (invalid.size > 0) {
    const what = method === "exact" ? "an amount like 12.50" : method === "percentage" ? "a percentage like 25" : "a number like 1 or 2";
    return result({ tone: "error", message: `Enter ${what} for each person.` });
  }

  // Values-only summaries work before the amount is known.
  const sum = entries.reduce((a, e) => a + (e.value ?? 0), 0);

  if (amountCents === null || amountCents <= 0) {
    if (method === "exact") for (const e of entries) preview.set(e.userId, e.value ?? 0);
    return result({ tone: "muted", message: "Enter the amount to see each share." });
  }

  const computed = computeShares(amountCents, method, entries);

  if (computed.ok) {
    for (const s of computed.shares) preview.set(s.userId, s.amountCents);
    for (const id of included) if (!preview.has(id)) preview.set(id, 0);

    if (computed.shares.every((s) => s.userId === paidById)) {
      return result({ tone: "error", message: "Include at least one person besides the payer." });
    }
    let detail: string | undefined;
    if (method === "equal") {
      const amounts = computed.shares.map((s) => s.amountCents);
      const lo = Math.min(...amounts);
      const hi = Math.max(...amounts);
      detail = lo === hi ? `${money(lo)} each` : `${money(lo)} or ${money(hi)} each`;
    } else if (method === "exact") {
      detail = `${money(amountCents)} of ${money(amountCents)}`;
    } else if (method === "percentage") {
      detail = "100% of 100%";
    } else {
      detail = `${formatWeight(sum)} ${sum === 1 ? "share" : "shares"} in all`;
    }
    return result({ tone: "ok", message: "All assigned", detail }, true);
  }

  // Not balanced yet: still show what we can per person.
  if (method === "exact") {
    for (const e of entries) preview.set(e.userId, e.value ?? 0);
    const remainder = amountCents - sum;
    if (remainder !== 0) {
      return result({
        tone: "error",
        message: remainder > 0 ? `${money(remainder)} left to assign` : `${money(-remainder)} over the total`,
        detail: `${money(sum)} of ${money(amountCents)}`,
      });
    }
  }
  if (method === "percentage") {
    for (const e of entries) preview.set(e.userId, Math.round((amountCents * (e.value ?? 0)) / 100));
    const bp = entries.reduce((a, e) => a + Math.round((e.value ?? 0) * 100), 0);
    if (bp !== 10000) {
      return result({
        tone: "error",
        message: bp < 10000 ? `${formatPercent(10000 - bp)} left to assign` : `${formatPercent(bp - 10000)} over 100%`,
        detail: `${formatPercent(bp)} of 100%`,
      });
    }
  }
  return result({ tone: "error", message: computed.error });
}
