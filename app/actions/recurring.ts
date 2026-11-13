"use server";

import { pauseRecurring, resumeRecurring, stopRecurring } from "@/lib/server/recurring";
import { authed } from "./run";

export async function pauseRecurringAction(id: string) {
  return authed((user) => pauseRecurring(user.id, id));
}

export async function resumeRecurringAction(id: string) {
  return authed((user) => resumeRecurring(user.id, id));
}

export async function stopRecurringAction(id: string) {
  return authed((user) => stopRecurring(user.id, id));
}
