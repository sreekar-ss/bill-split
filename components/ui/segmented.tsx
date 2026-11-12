"use client";

import { ToggleGroup } from "radix-ui";
import { cn } from "@/lib/utils/cn";

export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onValueChange(v as T)}
      aria-label={label}
      className={cn("grid auto-cols-fr grid-flow-col rounded-[10px] border border-field bg-paper p-1", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          className="h-11 rounded-[7px] px-2 text-body-sm font-semibold text-ink-muted data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:ring-2 data-[state=on]:ring-inset data-[state=on]:ring-ink"
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
