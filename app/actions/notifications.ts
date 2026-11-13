"use server";

import { guard } from "./run";
import { authed } from "./run";
import { sendReminder, unsubscribe, updateNotificationPrefs } from "@/lib/server/notifications";
import { AppError } from "@/lib/server/errors";

export async function updateNotificationPrefsAction(input: {
  notifyExpenses?: boolean;
  notifyPayments?: boolean;
  notifyReminders?: boolean;
  weeklyDigest?: boolean;
}) {
  return authed(async (user) => {
    await updateNotificationPrefs(user.id, input);
  });
}

/**
 * "Remind Ben": pushes a nudge to someone who owes you in a group (groupId) or directly (friendId = toUserId),
 * with email only as a fallback. data.delivered is false when they've turned reminders off, or no device
 * received the push and they have no confirmed email to fall back to.
 */
export async function sendReminderAction(input: { toUserId: string; groupId?: string; friendId?: string }) {
  return authed((user) => sendReminder(user.id, input));
}

/** From the /unsubscribe page (no login needed; the link is signed). */
export async function unsubscribeAction(input: { u: string; t: string; s: string }) {
  return guard(async () => {
    const ok = await unsubscribe(input.u, input.t, input.s);
    if (!ok) throw new AppError("This unsubscribe link isn't valid. Change your email settings from your account instead.", "VALIDATION");
    return { type: input.t };
  });
}
