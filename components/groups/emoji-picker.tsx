"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/cn";
import { GROUP_EMOJIS } from "./group-emojis";

const tile =
  "relative grid h-11 cursor-pointer place-items-center rounded-[10px] border border-rule bg-surface hover:bg-paper " +
  "has-[:checked]:border-ink has-[:checked]:bg-paper has-[:checked]:ring-2 has-[:checked]:ring-inset has-[:checked]:ring-ink " +
  "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus has-[:disabled]:cursor-default has-[:disabled]:opacity-45";

/**
 * A compact grid of emojis for a group, plus "No emoji", as one radio group: arrow keys move
 * between choices, and each one is named for screen readers. `value` "" means no emoji.
 */
export function EmojiPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (emoji: string) => void;
  disabled?: boolean;
}) {
  const name = useId();
  const hintId = `${name}-hint`;
  // An emoji saved some other way still shows, as the first choice, so the form never drops it silently.
  const options = value && !GROUP_EMOJIS.some((o) => o.emoji === value) ? [{ emoji: value, name: "Current emoji" }, ...GROUP_EMOJIS] : GROUP_EMOJIS;

  return (
    <fieldset aria-describedby={hintId} disabled={disabled}>
      <legend className="text-body-sm font-semibold">Emoji</legend>
      <p id={hintId} className="mt-0.5 text-meta text-ink-muted">
        Shown next to the group&apos;s name. In lists, groups without one show their initials.
      </p>
      <div className="mt-2 grid grid-cols-6 gap-1.5 sm:grid-cols-8">
        <label className={cn(tile, "col-span-2 px-2")}>
          <input
            type="radio"
            name={name}
            value=""
            checked={value === ""}
            onChange={() => onChange("")}
            className="sr-only"
          />
          <span className="text-meta font-semibold">No emoji</span>
        </label>
        {options.map((o) => (
          <label key={o.emoji} className={tile}>
            <input
              type="radio"
              name={name}
              value={o.emoji}
              checked={value === o.emoji}
              onChange={() => onChange(o.emoji)}
              aria-label={o.name}
              className="sr-only"
            />
            <span aria-hidden className="text-[1.375rem] leading-none">
              {o.emoji}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
