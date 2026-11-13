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
import { sendPushToUser } from "./push";
import { hit } from "./rate-limit";
import { sign, verifySignature } from "./tokens";

/**
 * Notifications. Channel policy (email is a scarce budget — Resend free plan):
 * - everyday updates (expense added, payment recorded, weekly summary) go by PUSH only;
 * - reminders go by push, and by email only when the person has no push device;
 * - account emails (confirm email, password reset, invites) live elsewhere and always send.
 * Rules:
 * - only active users are notified; EMAIL additionally needs a confirmed address (no mail to squatted/typo addresses);
 * - each type has one preference covering push and email (unsubscribing turns that type off everywhere);
 * - the actor is never notified about their own action;
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

/** Email needs a confirmed address; push needs only an active account (the device opted in itself). */
function canEmail(u: Recipient, type: NotificationType) {
  return u.status === "active" && u.emailVerified && u[PREF_FIELD[type]] !== false;
}
function canPush(u: Recipient, type: NotificationType) {
  return u.status === "active" && u[PREF_FIELD[type]] !== false;
}

/** Notification emails are optional: they're skipped once the day's email budget is used up. */
async function deliver(email: ReturnType<typeof renderEmail>): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  try {
    return await sendEmail(email, { priority: "optional" });
  } catch (error) {
    console.error("[notify] could not send", error);
    return false;
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
    if (u.id === actorId) continue;
    // Push only: email is reserved for things with no other channel (see the policy at the top).
    if (!canPush(u, "expenses")) continue;
    const stake = stakeInExpense(u.id, ledgerExpense);
    if (stake === 0 && s.amountCents === 0) continue;
    const share = formatMoney(s.amountCents, e.currency);
    const effect =
      stake > 0 ? `You get back ${formatMoney(stake, e.currency)}.` : stake < 0 ? `You owe ${formatMoney(-stake, e.currency)}.` : "";
    await sendPushToUser(u.id, {
      title: opts.recurring ? `${e.description} added (recurring)` : `${actor?.name ?? "Someone"} added ${e.description}`,
      body: `${effect || `Your share is ${share}.`}${where ? ` ${where.trim().replace(/^in /, "In ")}.` : ""}`,
      url: `/expenses/${e.id}`,
      tag: `expense-${e.id}`,
    });
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
    if (u.id === actorId) continue;
    const path = p.groupId ? `/groups/${p.groupId}` : `/friends/${other.id}`;
    if (canPush(u, "payments")) {
      await sendPushToUser(u.id, {
        title: u.id === p.toUser.id ? `${displayName(p.fromUser)} paid you ${amount}` : `Payment of ${amount} recorded`,
        body: line,
        url: path,
        tag: `payment-${paymentId}`,
      });
    }
  }
}

// ── Reminders ───────────────────────────────────────────────────────────────────────────────

/**
 * Nudge someone who owes you, in one context (group or direct). Only allowed when they really owe
 * you there, at most once per pair (across all groups and direct) every REMINDER_COOLDOWN_DAYS.
 * Includes your payment links.
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

  const { count, resetAt } = await hit(`remind:${fromUserId}:${toUserId}`, REMINDER_COOLDOWN_DAYS * 86400000);
  if (count > 1) {
    const days = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 86400000));
    throw new AppError(`You already reminded ${displayName(to)}. You can send another in ${days} day${days === 1 ? "" : "s"}.`, "RATE_LIMITED");
  }

  const amount = formatMoney(owedCents, currency);
  const pushed = canPush(to, "reminders")
    ? await sendPushToUser(to.id, {
        title: `Reminder from ${from.name}`,
        body: `You owe ${from.name} ${amount}${where}. Tap to settle up.`,
        url: link.replace(appUrl(), ""),
        tag: `reminder-${fromUserId}`,
      })
    : 0;
  // Push reached them: no email needed. Otherwise email is the fallback (if allowed and in budget).
  if (pushed > 0) return { delivered: true, name: displayName(to) };
  if (!canEmail(to, "reminders")) return { delivered: false, name: displayName(to) };

  const links = paymentLinks(from, owedCents, currency, `BillSplit${where}`);
  const emailed = await deliver(
    renderEmail({
      to: to.email,
      subject: `Reminder from ${from.name}: ${amount}${where}`,
      greeting: `Hi ${to.name},`,
      paragraphs: [
        `${from.name} sent you a friendly reminder: you owe them ${amount}${where}.`,
        links.length
          ? `You can pay with ${joinOr(links.map((l) => l.label))}, then record the payment in BillSplit so balances update.`
          : "When you've paid, record it in BillSplit so balances update.",
      ],
      links: links.map((l) => ({ label: `Pay ${from.name} ${amount} with ${l.label}`, url: l.url })),
      button: { label: "Settle up", url: link },
      unsubscribeUrl: unsubscribeUrl(to.id, "reminders"),
      oneClickUrl: oneClickUnsubscribeUrl(to.id, "reminders"),
    }),
  );
  return { delivered: emailed, name: displayName(to) };
}

/** "Venmo", "Venmo or PayPal", "Venmo, PayPal or Cash App". */
function joinOr(items: string[]) {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

// ── Weekly digest ───────────────────────────────────────────────────────────────────────────

/** Monday summary for users who opted in. Skips people who are all settled. Idempotent per ~week. */
export async function sendWeeklyDigests(now = new Date()) {
  const cutoff = new Date(now.getTime() - 6 * 86400000);
  const notRecent = [{ lastDigestAt: null }, { lastDigestAt: { lt: cutoff } }];
  // Push only (email budget): people who opted in and have at least one device.
  const due = await db.user.findMany({
    where: { status: "active", weeklyDigest: true, pushSubscriptions: { some: {} }, OR: notRecent },
    select: { id: true },
    // Oldest first, so a backlog over `take` is worked through instead of re-picking the same people.
    orderBy: { lastDigestAt: { sort: "asc", nulls: "first" } },
    take: 500,
  });
  let sent = 0;
  for (const u of due) {
    // Claim this user's week atomically: a cron retry or manual run won't send twice.
    const { count } = await db.user.updateMany({ where: { id: u.id, OR: notRecent }, data: { lastDigestAt: now } });
    if (count === 0) continue;
    const relations = await computeRelations(u.id);
    // Per currency: what you're owed and what you owe, and how many people.
    const totals = new Map<string, { owed: number; owe: number }>();
    const people = new Set<string>();
    for (const [id, rel] of relations) {
      for (const c of rel.byContext) {
        if (c.cents === 0) continue;
        people.add(id);
        const t = totals.get(c.context.currency) ?? { owed: 0, owe: 0 };
        if (c.cents > 0) t.owed += c.cents;
        else t.owe -= c.cents;
        totals.set(c.context.currency, t);
      }
    }
    if (people.size === 0) continue; // all settled: nothing to say
    const parts = [...totals].flatMap(([cur, t]) => [
      ...(t.owed ? [`you're owed ${formatMoney(t.owed, cur)}`] : []),
      ...(t.owe ? [`you owe ${formatMoney(t.owe, cur)}`] : []),
    ]);
    const body = `${parts.join(", ").replace(/^./, (c) => c.toUpperCase())}, across ${people.size} ${people.size === 1 ? "person" : "people"}.`;
    if ((await sendPushToUser(u.id, { title: "Your BillSplit week", body, url: "/home", tag: "weekly-summary" })) > 0) sent++;
  }
  return { considered: due.length, sent };
}
