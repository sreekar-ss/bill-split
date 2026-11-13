import "server-only";
import { stakeInExpense } from "@/lib/domain/ledger";
import { formatMoney } from "@/lib/domain/money";
import { paymentLinks } from "@/lib/domain/payment-links";
import { displayName } from "@/lib/utils/person";
import { notificationPrefsSchema } from "@/lib/validation";
import { appUrl } from "./app-url";
import { db } from "./db";
import { renderEmail } from "./email-template";
import { AppError } from "./errors";
import { computeRelations, loadGroupLedger } from "./ledger";
import { isEmailConfigured, sendEmail } from "./mailer";
import { parse } from "./parse";
import { hit } from "./rate-limit";
import { sign, verifySignature } from "./tokens";

/**
 * Email notifications. Rules:
 * - only active users with a CONFIRMED email are ever notified (no mail to squatted/typo addresses);
 * - each type respects the user's preference and carries a one-click unsubscribe link;
 * - the actor never gets an email about their own action;
 * - delivery failures are logged, never surfaced to the actor.
 */
export const NOTIFICATION_TYPES = ["expenses", "payments", "reminders", "digest"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const PREF_FIELD = {
  expenses: "notifyExpenses",
  payments: "notifyPayments",
  reminders: "notifyReminders",
  digest: "weeklyDigest",
} as const;

export const REMINDER_COOLDOWN_DAYS = 3;

// ── Preferences & unsubscribe ───────────────────────────────────────────────────────────────

export async function getNotificationPrefs(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { notifyExpenses: true, notifyPayments: true, notifyReminders: true, weeklyDigest: true, emailVerified: true },
  });
}

export async function updateNotificationPrefs(userId: string, input: unknown) {
  const data = parse(notificationPrefsSchema, input);
  return db.user.update({
    where: { id: userId },
    data,
    select: { notifyExpenses: true, notifyPayments: true, notifyReminders: true, weeklyDigest: true },
  });
}

/** Signed, stateless unsubscribe link for one user + type (works without logging in). */
export function unsubscribeUrl(userId: string, type: NotificationType) {
  const sig = sign("unsubscribe", `${userId}:${type}`);
  return `${appUrl()}/unsubscribe?u=${encodeURIComponent(userId)}&t=${type}&s=${sig}`;
}

/** One-click (RFC 8058) endpoint for mail providers; same signed query. */
export function oneClickUnsubscribeUrl(userId: string, type: NotificationType) {
  return unsubscribeUrl(userId, type).replace("/unsubscribe?", "/api/unsubscribe?");
}

export function verifyUnsubscribe(userId: string, type: string, sig: string): type is NotificationType {
  return (NOTIFICATION_TYPES as readonly string[]).includes(type) && verifySignature("unsubscribe", `${userId}:${type}`, sig);
}

/** Turns one notification type off. Returns false for a bad signature. Idempotent. */
export async function unsubscribe(userId: string, type: string, sig: string): Promise<boolean> {
  if (!verifyUnsubscribe(userId, type, sig)) return false;
  await db.user.updateMany({ where: { id: userId }, data: { [PREF_FIELD[type]]: false } });
  return true;
}

// ── Delivery helpers ────────────────────────────────────────────────────────────────────────

type Recipient = { id: string; name: string; email: string; status: string; emailVerified: boolean } & Partial<
  Record<(typeof PREF_FIELD)[NotificationType], boolean>
>;

function canNotify(u: Recipient, type: NotificationType) {
  return u.status === "active" && u.emailVerified && u[PREF_FIELD[type]] !== false;
}

async function deliver(email: ReturnType<typeof renderEmail>) {
  if (!isEmailConfigured()) return;
  try {
    await sendEmail(email);
  } catch (error) {
    console.error("[notify] could not send", error);
  }
}

const recipientSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  emailVerified: true,
  notifyExpenses: true,
  notifyPayments: true,
  notifyReminders: true,
  weeklyDigest: true,
} as const;

// ── Expense added ───────────────────────────────────────────────────────────────────────────

/** "Ana added Dinner in Lisbon trip — your share is $30.00". Sent to everyone with a stake except the actor. */
export async function notifyExpenseCreated(expenseId: string, actorId: string, opts: { recurring?: boolean } = {}) {
  const e = await db.expense.findUnique({
    where: { id: expenseId },
    select: {
      id: true,
      description: true,
      amountCents: true,
      currency: true,
      paidById: true,
      paidBy: { select: { name: true, status: true } },
      group: { select: { name: true } },
      splits: { select: { userId: true, amountCents: true, user: { select: recipientSelect } } },
    },
  });
  if (!e) return;
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { name: true } });
  const ledgerExpense = { paidById: e.paidById, amountCents: e.amountCents, shares: e.splits };
  const where = e.group ? ` in ${e.group.name}` : "";

  for (const s of e.splits) {
    const u = s.user;
    if (u.id === actorId || !canNotify(u, "expenses")) continue;
    const stake = stakeInExpense(u.id, ledgerExpense);
    if (stake === 0 && s.amountCents === 0) continue;
    const share = formatMoney(s.amountCents, e.currency);
    const payer = u.id === e.paidById ? "You paid" : `${displayName(e.paidBy)} paid`;
    const lead = opts.recurring
      ? `A recurring expense, ${e.description}, was added${where}.`
      : `${actor?.name ?? "Someone"} added ${e.description}${where}.`;
    const effect =
      stake > 0 ? `You get back ${formatMoney(stake, e.currency)}.` : stake < 0 ? `You owe ${formatMoney(-stake, e.currency)}.` : "";
    await deliver(
      renderEmail({
        to: u.email,
        subject: opts.recurring ? `${e.description}: recurring expense added` : `${actor?.name ?? "Someone"} added ${e.description}`,
        greeting: `Hi ${u.name},`,
        paragraphs: [lead, `${payer} ${formatMoney(e.amountCents, e.currency)}. Your share is ${share}. ${effect}`.trim()],
        button: { label: "View expense", url: `${appUrl()}/expenses/${e.id}` },
        notes: ["You're getting this because you're part of this expense."],
        unsubscribeUrl: unsubscribeUrl(u.id, "expenses"),
        oneClickUrl: oneClickUnsubscribeUrl(u.id, "expenses"),
      }),
    );
  }
}

// ── Payment recorded ────────────────────────────────────────────────────────────────────────

/** Tells the other party (not the actor) that a payment was recorded. */
export async function notifyPaymentRecorded(paymentId: string, actorId: string) {
  const p = await db.settlement.findUnique({
    where: { id: paymentId },
    select: {
      amountCents: true,
      currency: true,
      groupId: true,
      group: { select: { name: true } },
      fromUser: { select: recipientSelect },
      toUser: { select: recipientSelect },
    },
  });
  if (!p) return;
  const where = p.group ? ` in ${p.group.name}` : "";
  const amount = formatMoney(p.amountCents, p.currency);
  for (const [u, other, line] of [
    [p.toUser, p.fromUser, `${displayName(p.fromUser)} paid you ${amount}${where}.`],
    [p.fromUser, p.toUser, `A payment of ${amount} from you to ${displayName(p.toUser)}${where} was recorded.`],
  ] as const) {
    if (u.id === actorId || !canNotify(u, "payments")) continue;
    const link = p.groupId ? `${appUrl()}/groups/${p.groupId}` : `${appUrl()}/friends/${other.id}`;
    await deliver(
      renderEmail({
        to: u.email,
        subject: u.id === p.toUser.id ? `${displayName(p.fromUser)} paid you ${amount}` : `Payment of ${amount} recorded`,
        greeting: `Hi ${u.name},`,
        paragraphs: [line, "If this doesn't look right, open BillSplit to check or delete it."],
        button: { label: "Open balances", url: link },
        unsubscribeUrl: unsubscribeUrl(u.id, "payments"),
        oneClickUrl: oneClickUnsubscribeUrl(u.id, "payments"),
      }),
    );
  }
}

// ── Reminders ───────────────────────────────────────────────────────────────────────────────

/**
 * Nudge someone who owes you, in one context (group or direct). Only allowed when they really owe
 * you there, at most once per pair+context every REMINDER_COOLDOWN_DAYS. Includes your payment links.
 */
export async function sendReminder(fromUserId: string, input: { toUserId: string; groupId?: string; friendId?: string }) {
  const { toUserId, groupId } = input;
  if (!toUserId || toUserId === fromUserId) throw new AppError("Choose someone to remind.", "VALIDATION");

  let owedCents: number;
  let currency: string;
  let where = "";
  let link: string;
  if (groupId) {
    const group = await db.group.findFirst({
      where: { id: groupId, members: { some: { userId: fromUserId } } },
      select: { name: true, currency: true, members: { select: { userId: true } } },
    });
    if (!group) throw new AppError("That group doesn't exist or you don't have access to it.", "NOT_FOUND");
    const { plan } = await loadGroupLedger(groupId);
    owedCents = plan.filter((t) => t.fromUserId === toUserId && t.toUserId === fromUserId).reduce((s, t) => s + t.amountCents, 0);
    currency = group.currency;
    where = ` in ${group.name}`;
    link = `${appUrl()}/groups/${groupId}`;
  } else {
    if (input.friendId !== toUserId) throw new AppError("Choose someone to remind.", "VALIDATION");
    const rel = (await computeRelations(fromUserId)).get(toUserId);
    // Direct balances are kept per currency; remind about the largest one they owe you.
    const direct = (rel?.byContext ?? [])
      .filter((c) => c.context.kind === "direct" && c.cents > 0)
      .sort((a, b) => b.cents - a.cents)[0];
    owedCents = direct?.cents ?? 0;
    currency = direct?.context.currency ?? "USD";
    link = `${appUrl()}/friends/${fromUserId}`;
  }
  if (owedCents <= 0) throw new AppError("They don't owe you anything here, so there's nothing to remind them about.", "CONFLICT");

  const [from, to] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: fromUserId }, select: { name: true, venmoHandle: true, paypalMe: true, cashTag: true, upiId: true } }),
    db.user.findUniqueOrThrow({ where: { id: toUserId }, select: recipientSelect }),
  ]);

  const { count, resetAt } = await hit(`remind:${fromUserId}:${toUserId}:${groupId ?? "direct"}`, REMINDER_COOLDOWN_DAYS * 86400000);
  if (count > 1) {
    const days = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 86400000));
    throw new AppError(`You already reminded ${displayName(to)}. You can send another in ${days} day${days === 1 ? "" : "s"}.`, "RATE_LIMITED");
  }

  // Not deliverable: say so honestly, but the cooldown still applies (no spamming retries).
  if (!canNotify(to, "reminders")) return { delivered: false as const, name: displayName(to) };

  const amount = formatMoney(owedCents, currency);
  const links = paymentLinks(from, owedCents, currency, `BillSplit${where}`);
  await deliver(
    renderEmail({
      to: to.email,
      subject: `Reminder from ${from.name}: ${amount}${where}`,
      greeting: `Hi ${to.name},`,
      paragraphs: [
        `${from.name} sent you a friendly reminder: you owe them ${amount}${where}.`,
        links.length ? `You can pay with ${links.map((l) => l.label).join(", ")} from the settle-up screen, then record the payment.` : "When you've paid, record it in BillSplit so balances update.",
      ],
      button: { label: "Settle up", url: link },
      unsubscribeUrl: unsubscribeUrl(to.id, "reminders"),
        oneClickUrl: oneClickUnsubscribeUrl(to.id, "reminders"),
    }),
  );
  return { delivered: true as const, name: displayName(to) };
}

// ── Weekly digest ───────────────────────────────────────────────────────────────────────────

/** Monday summary for users who opted in. Skips people who are all settled. Idempotent per ~week. */
export async function sendWeeklyDigests(now = new Date()) {
  const due = await db.user.findMany({
    where: {
      status: "active",
      emailVerified: true,
      weeklyDigest: true,
      OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: new Date(now.getTime() - 6 * 86400000) } }],
    },
    select: { id: true, name: true, email: true, defaultCurrency: true },
    take: 500,
  });
  let sent = 0;
  for (const u of due) {
    const relations = await computeRelations(u.id);
    const lines: string[] = [];
    const ids = [...relations.keys()];
    const names = new Map(
      (await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, status: true } })).map((p) => [p.id, displayName(p)]),
    );
    for (const [id, rel] of relations) {
      for (const c of rel.byContext) {
        if (c.cents === 0) continue;
        const who = names.get(id) ?? "Someone";
        const amt = formatMoney(Math.abs(c.cents), c.context.currency);
        const ctx = c.context.kind === "group" ? ` (${c.context.name})` : "";
        lines.push(c.cents > 0 ? `${who} owes you ${amt}${ctx}` : `You owe ${who} ${amt}${ctx}`);
      }
    }
    await db.user.update({ where: { id: u.id }, data: { lastDigestAt: now } });
    if (lines.length === 0) continue;
    await deliver(
      renderEmail({
        to: u.email,
        subject: "Your BillSplit week: who owes what",
        greeting: `Hi ${u.name},`,
        paragraphs: ["Here's where your balances stand:", ...lines.slice(0, 15), ...(lines.length > 15 ? [`…and ${lines.length - 15} more.`] : [])],
        button: { label: "Open BillSplit", url: `${appUrl()}/home` },
        unsubscribeUrl: unsubscribeUrl(u.id, "digest"),
        oneClickUrl: oneClickUnsubscribeUrl(u.id, "digest"),
      }),
    );
    sent++;
  }
  return { considered: due.length, sent };
}
