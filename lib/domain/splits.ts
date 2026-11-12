import type { Cents } from "./money";

export const SPLIT_METHODS = ["equal", "exact", "percentage", "shares"] as const;
export type SplitMethod = (typeof SPLIT_METHODS)[number];

/**
 * One participant's input for a split.
 * - equal: `value` ignored
 * - exact: `value` = cents owed
 * - percentage: `value` = percent (0–100, up to 2 decimals)
 * - shares: `value` = positive weight (e.g. 1, 2, 1.5)
 */
export interface SplitEntry {
  userId: string;
  value?: number;
}

export interface Share {
  userId: string;
  amountCents: Cents;
}

export type SplitResult =
  | { ok: true; shares: Share[] }
  | { ok: false; error: string; /** cents still to assign (+) or over-assigned (−), for exact */ remainderCents?: Cents };

/**
 * Distribute `total` cents across weights using the largest-remainder method.
 * Deterministic: ties go to the earlier entry. Sum of output === total.
 */
export function allocateByWeights(total: Cents, weights: number[]): Cents[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("weights must sum to a positive number");
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map((r) => Math.floor(r));
  let left = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/** Compute each participant's share of an expense. Pure; the single source of truth for split math. */
export function computeShares(totalCents: Cents, method: SplitMethod, entries: SplitEntry[]): SplitResult {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    return { ok: false, error: "Enter an amount greater than zero." };
  }
  if (entries.length === 0) {
    return { ok: false, error: "Choose at least one person to split with." };
  }
  const ids = new Set(entries.map((e) => e.userId));
  if (ids.size !== entries.length) {
    return { ok: false, error: "Each person can only appear once in a split." };
  }

  switch (method) {
    case "equal": {
      const amounts = allocateByWeights(totalCents, entries.map(() => 1));
      return { ok: true, shares: entries.map((e, i) => ({ userId: e.userId, amountCents: amounts[i] })) };
    }
    case "exact": {
      const values = entries.map((e) => e.value ?? 0);
      if (values.some((v) => !Number.isSafeInteger(v) || v < 0)) {
        return { ok: false, error: "Exact amounts must be zero or more." };
      }
      const assigned = values.reduce((a, b) => a + b, 0);
      if (assigned !== totalCents) {
        return {
          ok: false,
          error: assigned < totalCents ? "Some of the amount is still unassigned." : "The split adds up to more than the total.",
          remainderCents: totalCents - assigned,
        };
      }
      const shares = entries.map((e, i) => ({ userId: e.userId, amountCents: values[i] })).filter((s) => s.amountCents > 0);
      if (shares.length === 0) return { ok: false, error: "Choose at least one person to split with." };
      return { ok: true, shares };
    }
    case "percentage": {
      const values = entries.map((e) => e.value ?? 0);
      if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) {
        return { ok: false, error: "Percentages must be between 0 and 100." };
      }
      // Compare in hundredths of a percent to avoid float drift.
      const totalBp = values.reduce((a, v) => a + Math.round(v * 100), 0);
      if (totalBp !== 10000) {
        return { ok: false, error: `Percentages add up to ${(totalBp / 100).toFixed(2).replace(/\.00$/, "")}%, not 100%.` };
      }
      return weightedShares(totalCents, entries, values);
    }
    case "shares": {
      const values = entries.map((e) => e.value ?? 0);
      if (values.some((v) => !Number.isFinite(v) || v < 0)) {
        return { ok: false, error: "Shares must be zero or more." };
      }
      if (values.reduce((a, b) => a + b, 0) <= 0) {
        return { ok: false, error: "Give at least one person a share." };
      }
      return weightedShares(totalCents, entries, values);
    }
    default:
      return { ok: false, error: "Unknown split method." };
  }
}

function weightedShares(totalCents: Cents, entries: SplitEntry[], weights: number[]): SplitResult {
  const amounts = allocateByWeights(totalCents, weights);
  const shares = entries
    .map((e, i) => ({ userId: e.userId, amountCents: amounts[i] }))
    .filter((s, i) => weights[i] > 0);
  return { ok: true, shares };
}
