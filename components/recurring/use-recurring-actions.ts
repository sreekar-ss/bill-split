"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { pauseRecurringAction, resumeRecurringAction, stopRecurringAction } from "@/app/actions/recurring";
import { runAction } from "@/lib/client/run-action";

type Verb = "pause" | "resume" | "stop";

const CALLS: Record<Verb, typeof pauseRecurringAction> = {
  pause: pauseRecurringAction,
  resume: resumeRecurringAction,
  stop: stopRecurringAction,
};

const DONE: Record<Verb, string> = { pause: "Paused", resume: "Resumed", stop: "Stopped" };

/**
 * Pause / resume / stop for one recurring schedule. The actions revalidate the app, so the server
 * components re-render with the new state; `working` tells the UI which call is in flight.
 */
export function useRecurringActions(id: string) {
  const [pending, startTransition] = useTransition();
  const [working, setWorking] = useState<Verb | null>(null);

  function run(verb: Verb, onDone?: () => void) {
    setWorking(verb);
    startTransition(async () => {
      const result = await runAction(() => CALLS[verb](id));
      setWorking(null);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(DONE[verb]);
      onDone?.();
    });
  }

  return {
    pending,
    working: pending ? working : null,
    pause: (onDone?: () => void) => run("pause", onDone),
    resume: (onDone?: () => void) => run("resume", onDone),
    stop: (onDone?: () => void) => run("stop", onDone),
  };
}

/** Text for the stop confirmation, shared by the list and the expense page. */
export const STOP_CONFIRM = {
  titleFor: (description: string) => `Stop repeating “${description}”?`,
  body: "Past expenses stay; no new ones will be added.",
  confirmLabel: "Stop repeating",
} as const;
