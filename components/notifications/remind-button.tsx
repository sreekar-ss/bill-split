"use client";

import { Bell, Check } from "lucide-react";
import { useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { sendReminderAction } from "@/app/actions/notifications";
import { Button } from "@/components/ui/button";
import { runAction } from "@/lib/client/run-action";
import { cn } from "@/lib/utils/cn";

// CONTRACT (owned by the account/notifications feature; used on group and friend pages). Keep props stable.
export interface RemindButtonProps {
  /** The person who owes the current user. */
  toUserId: string;
  toName: string;
  /** Exactly one: the group the debt is in, or (direct balance) friendId === toUserId. */
  groupId?: string;
  friendId?: string;
  className?: string;
}

// "Reminded" lasts for this browser tab's session, across page changes (the server's 3-day cooldown is the real limit).
const STORAGE_KEY = "bs-reminded";
const CHANGE_EVENT = "bs-reminded-change";
const memory = new Set<string>(); // Used when sessionStorage is blocked (private mode).

function readStored(): string[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function markReminded(key: string) {
  memory.add(key);
  try {
    const stored = readStored();
    if (!stored.includes(key)) sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...stored, key]));
  } catch {
    // Storage blocked: the in-memory set still covers this page view.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}

/**
 * "Remind": emails a nudge to someone who owes you, then shows "Reminded" for the rest of the session.
 * The server's cooldown is per person (across groups and direct), so "Reminded" is too.
 */
export function RemindButton({ toUserId, toName, groupId, friendId, className }: RemindButtonProps) {
  const key = toUserId;
  const reminded = useSyncExternalStore(
    subscribe,
    () => memory.has(key) || readStored().includes(key),
    () => false,
  );
  const [pending, startTransition] = useTransition();
  // Sent, but they can't get email: nothing was delivered, so don't claim "Reminded".
  const [undelivered, setUndelivered] = useState(false);
  // aria-disabled (not disabled) keeps focus on the button while it sends and after it flips to "Reminded".
  const inactive = pending || reminded || undelivered;

  function remind() {
    if (inactive) return;
    startTransition(async () => {
      const result = await runAction(() => sendReminderAction(groupId ? { toUserId, groupId } : { toUserId, friendId }));
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.data.delivered) {
        markReminded(key);
        toast.success(`Reminder sent to ${toName}`);
      } else {
        setUndelivered(true);
        toast(`${toName} has reminders turned off or hasn't confirmed their email, so we couldn't email them.`);
      }
    });
  }

  return (
    <Button
      size="sm"
      // A nudge, lower in the hierarchy than the row's settle action.
      variant="ghost"
      onClick={remind}
      aria-disabled={inactive || undefined}
      aria-label={
        reminded ? `Reminded ${toName}` : undelivered ? `Couldn't email ${toName}` : pending ? `Reminding ${toName}` : `Remind ${toName}`
      }
      data-testid="remind-button"
      // Muted text (not opacity) keeps the lasting "Reminded" state above 4.5:1 in both themes.
      className={cn("h-11 aria-disabled:cursor-default aria-disabled:text-ink-muted aria-disabled:hover:bg-transparent", className)}
    >
      {undelivered ? (
        "Couldn't email"
      ) : reminded ? (
        <>
          <Check aria-hidden />
          Reminded
        </>
      ) : pending ? (
        "Reminding…"
      ) : (
        <>
          <Bell aria-hidden />
          Remind
        </>
      )}
    </Button>
  );
}
