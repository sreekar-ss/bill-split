import { describe, expect, it } from "vitest";
import { allocateByWeights, computeShares } from "@/lib/domain/splits";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const people = (...ids: string[]) => ids.map((userId) => ({ userId }));

describe("allocateByWeights", () => {
  it("always sums to the total", () => {
    for (const total of [1, 2, 99, 100, 1000, 12345, 99999]) {
      for (const weights of [[1, 1, 1], [1, 2, 3], [0.5, 0.25, 0.25], [7], [1, 1, 1, 1, 1, 1, 1]]) {
        expect(sum(allocateByWeights(total, weights))).toBe(total);
      }
    }
  });
  it("gives remainder cents to earliest entries on ties", () => {
    expect(allocateByWeights(1000, [1, 1, 1])).toEqual([334, 333, 333]);
    expect(allocateByWeights(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });
});

describe("computeShares", () => {
  it("splits $10 three ways exactly", () => {
    const r = computeShares(1000, "equal", people("a", "b", "c"));
    expect(r.ok && r.shares.map((s) => s.amountCents)).toEqual([334, 333, 333]);
  });

  it("validates exact splits and reports the remainder", () => {
    const short = computeShares(1000, "exact", [{ userId: "a", value: 400 }, { userId: "b", value: 280 }]);
    expect(short).toMatchObject({ ok: false, remainderCents: 320 });
    const over = computeShares(1000, "exact", [{ userId: "a", value: 800 }, { userId: "b", value: 300 }]);
    expect(over).toMatchObject({ ok: false, remainderCents: -100 });
    const ok = computeShares(1000, "exact", [{ userId: "a", value: 1000 }, { userId: "b", value: 0 }]);
    expect(ok).toEqual({ ok: true, shares: [{ userId: "a", amountCents: 1000 }] });
  });

  it("splits by percentage with cent-accurate rounding", () => {
    const r = computeShares(1001, "percentage", [
      { userId: "a", value: 33.33 }, { userId: "b", value: 33.33 }, { userId: "c", value: 33.34 },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(sum(r.shares.map((s) => s.amountCents))).toBe(1001);
  });

  it("rejects percentages that don't total 100", () => {
    const r = computeShares(1000, "percentage", [{ userId: "a", value: 50 }, { userId: "b", value: 40 }]);
    expect(r).toMatchObject({ ok: false, error: "Percentages add up to 90%, not 100%." });
  });

  it("splits by shares and drops zero-share people", () => {
    const r = computeShares(9000, "shares", [{ userId: "a", value: 2 }, { userId: "b", value: 1 }, { userId: "c", value: 0 }]);
    expect(r).toEqual({ ok: true, shares: [{ userId: "a", amountCents: 6000 }, { userId: "b", amountCents: 3000 }] });
  });

  it("rejects bad input", () => {
    expect(computeShares(0, "equal", people("a")).ok).toBe(false);
    expect(computeShares(100, "equal", []).ok).toBe(false);
    expect(computeShares(100, "equal", people("a", "a")).ok).toBe(false);
    expect(computeShares(100, "exact", [{ userId: "a", value: 50.5 }]).ok).toBe(false);
    expect(computeShares(100, "shares", [{ userId: "a", value: 0 }]).ok).toBe(false);
  });
});
