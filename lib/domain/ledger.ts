import type { Cents } from "./money";

/**
 * The ledger is derived, never stored. For a set of expenses and payments in one context
 * (a group, or the direct relationship between two friends):
 *
 *   net(user) = Σ paid by user − Σ user's shares + Σ payments sent by user − Σ payments received by user
 *
 * net > 0 → the user gets money back; net < 0 → the user owes. Nets in a context always sum to 0.
 */

export interface LedgerExpense {
  paidById: string;
  amountCents: Cents;
  shares: { userId: string; amountCents: Cents }[];
}

export interface LedgerPayment {
  fromUserId: string;
  toUserId: string;
  amountCents: Cents;
}

export interface Transfer {
  fromUserId: string;
  toUserId: string;
  amountCents: Cents;
}

export type Nets = Map<string, Cents>;

function add(nets: Nets, userId: string, delta: Cents) {
  nets.set(userId, (nets.get(userId) ?? 0) + delta);
}

export function computeNets(expenses: LedgerExpense[], payments: LedgerPayment[], memberIds: string[] = []): Nets {
  const nets: Nets = new Map();
  for (const id of memberIds) nets.set(id, 0);
  for (const e of expenses) {
    add(nets, e.paidById, e.amountCents);
    for (const s of e.shares) add(nets, s.userId, -s.amountCents);
  }
  for (const p of payments) {
    add(nets, p.fromUserId, p.amountCents);
    add(nets, p.toUserId, -p.amountCents);
  }
  return nets;
}

/**
 * Turn nets into a minimal-ish list of transfers ("who pays whom").
 * Greedy: repeatedly match the largest debtor with the largest creditor. This yields at most n−1
 * transfers and is deterministic (ties broken by userId) so the plan doesn't jump around between renders.
 */
export function simplifyDebts(nets: Nets): Transfer[] {
  const debtors: { id: string; amt: Cents }[] = [];
  const creditors: { id: string; amt: Cents }[] = [];
  for (const [id, net] of nets) {
    if (net < 0) debtors.push({ id, amt: -net });
    else if (net > 0) creditors.push({ id, amt: net });
  }
  const byAmountThenId = (a: { id: string; amt: Cents }, b: { id: string; amt: Cents }) =>
    b.amt - a.amt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const transfers: Transfer[] = [];
  while (debtors.length && creditors.length) {
    debtors.sort(byAmountThenId);
    creditors.sort(byAmountThenId);
    const d = debtors[0];
    const c = creditors[0];
    const amt = Math.min(d.amt, c.amt);
    transfers.push({ fromUserId: d.id, toUserId: c.id, amountCents: amt });
    d.amt -= amt;
    c.amt -= amt;
    if (d.amt === 0) debtors.shift();
    if (c.amt === 0) creditors.shift();
  }
  return transfers;
}

/**
 * From one context's transfers, the signed amount between `me` and each other person:
 * positive → they owe me; negative → I owe them.
 */
export function relationsFor(me: string, transfers: Transfer[]): Map<string, Cents> {
  const out = new Map<string, Cents>();
  for (const t of transfers) {
    if (t.toUserId === me) out.set(t.fromUserId, (out.get(t.fromUserId) ?? 0) + t.amountCents);
    else if (t.fromUserId === me) out.set(t.toUserId, (out.get(t.toUserId) ?? 0) - t.amountCents);
  }
  return out;
}

/** The user's own stake in one expense, for "you lent $X" / "you borrowed $Y" labels. */
export function stakeInExpense(me: string, e: LedgerExpense): Cents {
  const myShare = e.shares.find((s) => s.userId === me)?.amountCents ?? 0;
  return (e.paidById === me ? e.amountCents : 0) - myShare;
}
