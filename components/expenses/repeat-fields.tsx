"use client";

import { lowerFirst, shortDate } from "@/components/recurring/format";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { toDateInput } from "@/lib/domain/dates";
import { anchorFor, describeSchedule, endsOnTooSoon, firstRepeatOn, nextOccurrence, type Frequency } from "@/lib/domain/recurrence";
import type { RecurrenceInput } from "@/lib/validation";

export type RepeatChoice = "never" | Frequency;

export interface RepeatDraft {
  frequency: RepeatChoice;
  /** 1–12 */
  interval: number;
  /** yyyy-mm-dd, or "" for no end date. */
  endsOn: string;
}

export const NO_REPEAT: RepeatDraft = { frequency: "never", interval: 1, endsOn: "" };

const OPTIONS: { value: RepeatChoice; label: string }[] = [
  { value: "never", label: "Never" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const INTERVALS = Array.from({ length: 12 }, (_, i) => i + 1);

const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The second argument for createExpenseAction, or undefined when the expense doesn't repeat. */
export function toRecurrence(draft: RepeatDraft): RecurrenceInput | undefined {
  if (draft.frequency === "never") return undefined;
  return { frequency: draft.frequency, interval: draft.interval, ...(draft.endsOn ? { endsOn: draft.endsOn } : {}) };
}

/** Today on the daily job's calendar (UTC), which decides the first repeat. */
const jobToday = () => toDateInput(new Date());

function scheduleFor(draft: RepeatDraft & { frequency: Frequency }, date: string) {
  return { frequency: draft.frequency, interval: draft.interval, anchorDay: anchorFor(draft.frequency, date) };
}

/** The date the schedule first repeats on (never in the past), or null when it doesn't repeat. */
export function firstRepeat(draft: RepeatDraft, date: string, today = jobToday()): string | null {
  if (draft.frequency === "never" || !isDate(date)) return null;
  return firstRepeatOn(scheduleFor({ ...draft, frequency: draft.frequency }, date), date, today);
}

/** Same rules as the server: the end date can't be before the expense, or before the first repeat. */
export function endsOnError(draft: RepeatDraft, date: string, today = jobToday()): string | undefined {
  if (draft.frequency === "never" || !draft.endsOn || !isDate(date)) return undefined;
  if (draft.endsOn < date) return "Choose a date on or after the expense date.";
  const next = firstRepeat(draft, date, today);
  return next && draft.endsOn < next ? endsOnTooSoon(next) : undefined;
}

/**
 * "Repeats every Monday, starting Nov 16. We'll add it automatically." For a back-dated expense
 * whose repeats would already have passed: "Repeats every Monday, next on Nov 16. Weeks already
 * past aren't added."
 */
export function repeatSentence(draft: RepeatDraft, date: string, today = jobToday()): string | null {
  if (draft.frequency === "never" || !isDate(date)) return null;
  const schedule = scheduleFor({ ...draft, frequency: draft.frequency }, date);
  const described = lowerFirst(describeSchedule(schedule));
  const next = firstRepeatOn(schedule, date, today);
  const until = isDate(draft.endsOn) && draft.endsOn >= next ? `, until ${shortDate(draft.endsOn)}` : "";
  if (nextOccurrence(schedule, date) < today) {
    const unit = draft.frequency === "monthly" ? "Months" : "Weeks";
    return `Repeats ${described}, next on ${shortDate(next)}${until}. ${unit} already past aren't added.`;
  }
  return `Repeats ${described}, starting ${shortDate(date)}${until}. We'll add it automatically.`;
}

/** Repeat: Never / Weekly / Monthly, then how often and an optional end date (add-expense only). */
export function RepeatFields({
  value,
  onChange,
  date,
  errors,
  endsOnRef,
  intervalRef,
}: {
  value: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
  /** The expense date: the first occurrence (the end date must be on or after the first repeat). */
  date: string;
  errors: { interval?: string; endsOn?: string };
  endsOnRef?: React.Ref<HTMLInputElement>;
  intervalRef?: React.Ref<HTMLSelectElement>;
}) {
  const repeating = value.frequency !== "never";
  const unit = value.frequency === "monthly" ? "month" : "week";
  const sentence = repeatSentence(value, date);
  const minEnd = firstRepeat(value, date);

  return (
    <div>
      <div className="space-y-1.5">
        {/* The toggle group carries the accessible name; this is its visible twin. */}
        <p aria-hidden className="text-body-sm font-semibold text-ink">
          Repeat
        </p>
        <Segmented
          label="Repeat"
          value={value.frequency}
          onValueChange={(frequency) => onChange({ ...value, frequency })}
          options={OPTIONS}
        />
      </div>

      {repeating ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Every" error={errors.interval} className="min-w-0">
              {(p) => (
                <Select
                  {...p}
                  ref={intervalRef}
                  className="num"
                  value={String(value.interval)}
                  onChange={(e) => onChange({ ...value, interval: Number(e.target.value) })}
                >
                  {INTERVALS.map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? `1 ${unit}` : `${n} ${unit}s`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Ends (optional)" error={errors.endsOn} className="min-w-0">
              {(p) => (
                <Input
                  {...p}
                  ref={endsOnRef}
                  type="date"
                  className="num"
                  min={minEnd ?? undefined}
                  value={value.endsOn}
                  onChange={(e) => onChange({ ...value, endsOn: e.target.value })}
                />
              )}
            </Field>
        </div>
      ) : null}
      {/* Always mounted (empty when not repeating), so choosing Weekly announces the sentence: a live
          region that appears together with its text is usually not read. */}
      <p className={repeating ? "mt-3 text-body-sm text-ink-muted" : undefined} aria-live="polite">
        {repeating ? (sentence ?? "Choose a date to see when it repeats.") : null}
      </p>
    </div>
  );
}
