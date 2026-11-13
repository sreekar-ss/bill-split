"use client";

import { Check, CircleAlert } from "lucide-react";
import { Switch } from "radix-ui";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { updateNotificationPrefsAction } from "@/app/actions/notifications";
import { runAction } from "@/lib/client/run-action";

type PrefKey = "notifyExpenses" | "notifyPayments" | "notifyReminders" | "weeklyDigest";
export type NotificationPrefs = Record<PrefKey, boolean>;

const ROWS: { key: PrefKey; label: string; hint: string }[] = [
  { key: "notifyExpenses", label: "When someone adds an expense with you", hint: "Who added it and what your share is." },
  { key: "notifyPayments", label: "When someone records a payment with you", hint: "Who paid whom, and how much." },
  { key: "notifyReminders", label: "Reminders when you owe someone", hint: "A friend's or group member's nudge to pay them back." },
  { key: "weeklyDigest", label: "Weekly summary (Mondays)", hint: "Your balances once a week. We skip it when you're all settled up." },
];

/** Jumps to the "Resend link" button at the top of Account (EmailStatus) and focuses it, so keyboard users land on it. */
function focusResend(e: React.MouseEvent<HTMLAnchorElement>) {
  const button = document.querySelector<HTMLButtonElement>("#email-status button");
  if (!button) return; // Falls back to the plain #email-status jump.
  e.preventDefault();
  button.focus();
}

// One toast slot, so flipping several switches in a row shows one "Saved", not a stack.
const TOAST_ID = "notification-prefs";

/**
 * Each switch saves as soon as it changes (like the theme picker above it). The switch flips
 * straight away and flips back, with the server's error, if the save fails.
 */
export function NotificationSettings({ initial, emailVerified, email }: { initial: NotificationPrefs; emailVerified: boolean; email: string }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<Partial<Record<PrefKey, boolean>>>({});
  // Guards against a second flip of the same switch before the first save answers.
  const inFlight = useRef(new Set<PrefKey>());
  const baseId = useId();

  async function change(key: PrefKey, value: boolean) {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving((s) => ({ ...s, [key]: true }));
    const result = await runAction(() => updateNotificationPrefsAction({ [key]: value }));
    inFlight.current.delete(key);
    setSaving((s) => ({ ...s, [key]: false }));
    if (result.ok) {
      toast.success("Saved", { id: TOAST_ID });
    } else {
      setPrefs((p) => ({ ...p, [key]: !value }));
      toast.error(result.error, { id: TOAST_ID });
    }
  }

  return (
    <div>
      {emailVerified ? (
        <p className="-mt-1 mb-4 text-body-sm text-ink-muted">
          Choose which emails we send to <span className="font-semibold text-ink [overflow-wrap:anywhere]">{email}</span>. Changes save
          straight away, and every email has an unsubscribe link too.
        </p>
      ) : (
        <div className="-mt-1 mb-4 flex items-start gap-3 rounded-[10px] border border-rule bg-surface px-3 py-2.5" data-testid="notifications-unconfirmed">
          <CircleAlert className="mt-0.5 size-[18px] shrink-0 text-ink-muted" aria-hidden />
          <p className="text-body-sm text-ink">
            We only send emails to confirmed addresses, so you won&apos;t get any of these until you confirm{" "}
            <span className="font-semibold [overflow-wrap:anywhere]">{email}</span>.{" "}
            <a href="#email-status" onClick={focusResend} className="font-semibold underline underline-offset-4">
              Resend the confirmation link
            </a>
          </p>
        </div>
      )}

      <ul className="divide-y divide-rule border-y border-rule">
        {ROWS.map(({ key, label, hint }) => {
          const id = `${baseId}-${key}`;
          const checked = prefs[key];
          return (
            <li key={key} className="flex min-h-11 items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <label htmlFor={id} className="block cursor-pointer text-body-sm font-semibold text-ink">
                  {label}
                </label>
                <p id={`${id}-hint`} className="mt-0.5 text-meta text-ink-muted">
                  {hint}
                </p>
              </div>
              {/* Tap area: the whole label, plus the switch padded out to 44px. Position and the check carry the state, not colour alone. */}
                <Switch.Root
                  id={id}
                  checked={checked}
                  onCheckedChange={(v) => change(key, v)}
                  aria-describedby={`${id}-hint`}
                  aria-busy={saving[key] || undefined}
                  data-testid={`pref-${key}`}
                  className="group relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-field bg-paper transition-colors motion-reduce:transition-none data-[state=checked]:border-ink data-[state=checked]:bg-ink before:absolute before:-inset-2 before:content-['']"
                >
                  <Switch.Thumb className="grid size-5 translate-x-[3px] place-items-center rounded-full bg-field transition-transform motion-reduce:transition-none data-[state=checked]:translate-x-[23px] data-[state=checked]:bg-surface">
                    <Check className="size-3.5 text-ink opacity-0 group-data-[state=checked]:opacity-100" strokeWidth={3} aria-hidden />
                  </Switch.Thumb>
                </Switch.Root>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
