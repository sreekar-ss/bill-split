"use server";

import { headers } from "next/headers";
import { AppError } from "@/lib/server/errors";
import { removePushSubscription, savePushSubscription, sendPushToUser } from "@/lib/server/push";
import { hit } from "@/lib/server/rate-limit";
import { authed } from "./run";

/** Called by the browser after the user turns push on (PushSubscription.toJSON()). */
export async function savePushSubscriptionAction(subscription: unknown) {
  const ua = (await headers()).get("user-agent");
  return authed(async (user) => {
    await savePushSubscription(user.id, subscription, ua);
  });
}

export async function removePushSubscriptionAction(endpoint: string) {
  return authed(async (user) => {
    await removePushSubscription(user.id, endpoint);
  });
}

/** "Send a test notification" — at most 5 an hour. */
export async function sendTestPushAction() {
  return authed(async (user) => {
    const { count } = await hit(`pushtest:${user.id}`, 60 * 60 * 1000);
    if (count > 5) throw new AppError("That's enough tests for now. Try again in an hour.", "RATE_LIMITED");
    const delivered = await sendPushToUser(user.id, {
      title: "Notifications are on",
      body: "You'll hear from BillSplit here when friends add expenses, pay you or send a reminder.",
      url: "/account#notifications",
      tag: "test",
    });
    return { delivered };
  });
}
