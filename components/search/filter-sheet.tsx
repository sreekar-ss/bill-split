"use client";

import { useState } from "react";
import { CATEGORY_OPTIONS, isCategory } from "@/components/expenses/categories";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Sheet } from "@/components/ui/sheet";
import { parseAmountToCents } from "@/lib/domain/money";
import { amountLabel, isIsoDate, type ActivityFilters, type FilterOption, type PaidBy } from "./filters";

type PaidByChoice = PaidBy | "any";

interface Draft {
  groupId: string;
  friendId: string;
  category: string;
  from: string;
  to: string;
  paidBy: PaidByChoice;
  min: string;
  max: string;
}

type DraftErrors = Partial<Record<"to" | "min" | "max", string>>;

const PAID_BY_OPTIONS: { value: PaidByChoice; label: string }[] = [
  { value: "any", label: "Anyone" },
  { value: "me", label: "You" },
  { value: "others", label: "Others" },
];

const FORM_ID = "activity-filters";

function toDraft(f: ActivityFilters): Draft {
  return {
    groupId: f.groupId ?? "",
    friendId: f.friendId ?? "",
    category: f.category ?? "",
    from: f.from ?? "",
    to: f.to ?? "",
    paidBy: f.paidBy ?? "any",
    min: f.minCents !== undefined ? amountLabel(f.minCents) : "",
    max: f.maxCents !== undefined ? amountLabel(f.maxCents) : "",
  };
}

const EMPTY_DRAFT = toDraft({});

/** Turns the draft into filters (without the text search), or returns per-field errors. */
function fromDraft(d: Draft): { ok: true; filters: Omit<ActivityFilters, "q"> } | { ok: false; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const min = d.min.trim() ? parseAmountToCents(d.min) : undefined;
  const max = d.max.trim() ? parseAmountToCents(d.max) : undefined;
  if (min === null) errors.min = "Enter an amount like 12.50.";
  if (max === null) errors.max = "Enter an amount like 12.50.";
  if (typeof min === "number" && typeof max === "number" && min > max) errors.max = "Make this at least the lowest amount.";
  const from = isIsoDate(d.from) ? d.from : undefined;
  const to = isIsoDate(d.to) ? d.to : undefined;
  if (from && to && from > to) errors.to = "Pick a date on or after the start date.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    filters: {
      groupId: d.groupId || undefined,
      friendId: d.friendId || undefined,
      category: isCategory(d.category) ? d.category : undefined,
      from,
      to,
      paidBy: d.paidBy === "any" ? undefined : d.paidBy,
      minCents: min ?? undefined,
      maxCents: max ?? undefined,
    },
  };
}

/**
 * The Activity filters: a bottom sheet on mobile, a dialog from md up (the shared Sheet).
 * Edits a draft; nothing changes on the page until "Show results".
 */
export function FilterSheet({
  open,
  onOpenChange,
  value,
  groups,
  friends,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ActivityFilters;
  groups: FilterOption[];
  friends: FilterOption[];
  onApply: (filters: Omit<ActivityFilters, "q">) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [errors, setErrors] = useState<DraftErrors>({});
  // Start from the applied filters every time the sheet opens (adjusting state during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(toDraft(value));
      setErrors({});
    }
  }

  const set = <K extends keyof Draft>(key: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: v }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const result = fromDraft(draft);
    if (!result.ok) {
      setErrors(result.errors);
      // Focus the first invalid field after the error renders.
      const form = e.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
      return;
    }
    onApply(result.filters);
    onOpenChange(false);
  }

  const knownGroup = !draft.groupId || groups.some((g) => g.id === draft.groupId);
  const knownFriend = !draft.friendId || friends.some((p) => p.id === draft.friendId);

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      description="Narrow down the expenses on Activity."
      footer={
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(EMPTY_DRAFT);
              setErrors({});
            }}
          >
            Clear all
          </Button>
          <Button type="submit" form={FORM_ID}>
            Show results
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-5 pb-2">
        <Field label="Group">
          {(p) => (
            <Select {...p} value={draft.groupId} onChange={(e) => set("groupId", e.target.value)}>
              <option value="">Any group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
              {knownGroup ? null : <option value={draft.groupId}>A group you&apos;ve left</option>}
            </Select>
          )}
        </Field>

        <Field label="Friend" hint="Expenses that involve you and them, in a group or directly.">
          {(p) => (
            <Select {...p} value={draft.friendId} onChange={(e) => set("friendId", e.target.value)}>
              <option value="">Anyone</option>
              {friends.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
              {knownFriend ? null : <option value={draft.friendId}>Someone no longer a friend</option>}
            </Select>
          )}
        </Field>

        <Field label="Category">
          {(p) => (
            <Select {...p} value={draft.category} onChange={(e) => set("category", e.target.value)}>
              <option value="">Any category</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="space-y-1.5">
          <p aria-hidden className="text-body-sm font-semibold">
            Paid by
          </p>
          <Segmented label="Paid by" value={draft.paidBy} onValueChange={(v) => set("paidBy", v)} options={PAID_BY_OPTIONS} />
        </div>

        <fieldset>
          <legend className="mb-2 text-body-sm font-semibold">Date</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<span className="font-normal text-ink-muted">From</span>}>
              {(p) => <Input {...p} type="date" value={draft.from} max={draft.to || undefined} onChange={(e) => set("from", e.target.value)} />}
            </Field>
            <Field label={<span className="font-normal text-ink-muted">To</span>} error={errors.to}>
              {(p) => <Input {...p} type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => set("to", e.target.value)} />}
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-body-sm font-semibold">Amount</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<span className="font-normal text-ink-muted">At least</span>} error={errors.min}>
              {(p) => (
                <Input {...p} inputMode="decimal" autoComplete="off" placeholder="0.00" className="num" value={draft.min} onChange={(e) => set("min", e.target.value)} />
              )}
            </Field>
            <Field label={<span className="font-normal text-ink-muted">At most</span>} error={errors.max}>
              {(p) => (
                <Input {...p} inputMode="decimal" autoComplete="off" placeholder="Any" className="num" value={draft.max} onChange={(e) => set("max", e.target.value)} />
              )}
            </Field>
          </div>
          <p className="mt-1.5 text-meta text-ink-muted">The full expense amount, in its own currency.</p>
        </fieldset>
      </form>
    </Sheet>
  );
}
