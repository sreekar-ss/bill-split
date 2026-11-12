import { describe, expect, it } from "vitest";
import { computeNets, relationsFor, simplifyDebts, stakeInExpense, type LedgerExpense } from "@/lib/domain/ledger";

const exp = (paidById: string, amountCents: number, shares: Record<string, number>): LedgerExpense => ({
  paidById, amountCents, shares: Object.entries(shares).map(([userId, a]) => ({ userId, amountCents: a })),
});

describe("computeNets", () => {
  it("credits the payer and debits each share", () => {
    const nets = computeNets([exp("ana", 9000, { ana: 3000, ben: 3000, cy: 3000 })], []);
    expect(Object.fromEntries(nets)).toEqual({ ana: 6000, ben: -3000, cy: -3000 });
  });

  it("payments move balances toward zero", () => {
    const nets = computeNets(
      [exp("ana", 9000, { ana: 3000, ben: 3000, cy: 3000 })],
      [{ fromUserId: "ben", toUserId: "ana", amountCents: 3000 }],
    );
    expect(Object.fromEntries(nets)).toEqual({ ana: 3000, ben: 0, cy: -3000 });
  });

  it("includes members with no activity at zero", () => {
    expect(computeNets([], [], ["x"]).get("x")).toBe(0);
  });
});

describe("simplifyDebts", () => {
  it("routes around intermediaries", () => {
    // ana owes ben 10, ben owes cy 10 → ana pays cy 10
    const nets = computeNets([exp("ben", 1000, { ana: 1000 }), exp("cy", 1000, { ben: 1000 })], []);
    expect(simplifyDebts(nets)).toEqual([{ fromUserId: "ana", toUserId: "cy", amountCents: 1000 }]);
  });

  it("settles every balance, using at most n-1 transfers", () => {
    const nets = new Map([["a", 5000], ["b", -2000], ["c", -1500], ["d", -1500], ["e", 0]]);
    const plan = simplifyDebts(nets);
    expect(plan.length).toBeLessThanOrEqual(4);
    const after = new Map(nets);
    for (const t of plan) {
      after.set(t.fromUserId, after.get(t.fromUserId)! + t.amountCents);
      after.set(t.toUserId, after.get(t.toUserId)! - t.amountCents);
    }
    expect([...after.values()].every((v) => v === 0)).toBe(true);
  });

  it("is deterministic regardless of input order", () => {
    const a = simplifyDebts(new Map([["x", -100], ["y", -100], ["z", 200]]));
    const b = simplifyDebts(new Map([["z", 200], ["y", -100], ["x", -100]]));
    expect(a).toEqual(b);
  });

  it("returns nothing when everyone is settled", () => {
    expect(simplifyDebts(new Map([["a", 0], ["b", 0]]))).toEqual([]);
  });

  it("fully settles randomized ledgers", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const ids = ["a", "b", "c", "d", "e", "f"];
    for (let round = 0; round < 200; round++) {
      const expenses = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => {
        const amount = 1 + Math.floor(rand() * 50000);
        const payer = ids[Math.floor(rand() * ids.length)];
        const part = ids.filter(() => rand() > 0.4);
        const who = part.length ? part : [payer];
        const each = Math.floor(amount / who.length);
        const shares: Record<string, number> = {};
        who.forEach((id, i) => (shares[id] = each + (i < amount - each * who.length ? 1 : 0)));
        return exp(payer, amount, shares);
      });
      const nets = computeNets(expenses, []);
      expect([...nets.values()].reduce((x, y) => x + y, 0)).toBe(0);
      const after = new Map(nets);
      const plan = simplifyDebts(nets);
      for (const t of plan) {
        expect(t.amountCents).toBeGreaterThan(0);
        after.set(t.fromUserId, after.get(t.fromUserId)! + t.amountCents);
        after.set(t.toUserId, after.get(t.toUserId)! - t.amountCents);
      }
      expect([...after.values()].every((v) => v === 0)).toBe(true);
    }
  });
});

describe("relationsFor / stakeInExpense", () => {
  it("signs relations from my point of view", () => {
    const rel = relationsFor("ana", [
      { fromUserId: "ben", toUserId: "ana", amountCents: 500 },
      { fromUserId: "ana", toUserId: "cy", amountCents: 200 },
      { fromUserId: "ben", toUserId: "cy", amountCents: 999 },
    ]);
    expect(Object.fromEntries(rel)).toEqual({ ben: 500, cy: -200 });
  });

  it("computes what I lent or borrowed", () => {
    const e = exp("ana", 9000, { ana: 3000, ben: 6000 });
    expect(stakeInExpense("ana", e)).toBe(6000);
    expect(stakeInExpense("ben", e)).toBe(-6000);
    expect(stakeInExpense("zed", e)).toBe(0);
  });
});
