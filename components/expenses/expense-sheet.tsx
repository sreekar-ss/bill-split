"use client";

// CONTRACT (owned by the expenses feature): the shell renders exactly one of these.
import { Plus } from "lucide-react";
import { useId, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { createExpenseAction, updateExpenseAction } from "@/app/actions/expenses";
import type { AddExpensePreset } from "@/components/shell/add-expense-context";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { todayInput } from "@/lib/domain/dates";
import { centsToInput, parseAmountToCents } from "@/lib/domain/money";
import type { SplitMethod } from "@/lib/domain/splits";
import type { ExpenseDetail } from "@/lib/server/expenses";
import type { ExpenseContexts } from "@/lib/server/groups";
import type { ExpenseCategory, ExpenseInput } from "@/lib/validation";
import { cn } from "@/lib/utils/cn";
import { CATEGORY_OPTIONS, currencyName, currencySymbol, isCategory } from "./categories";
import { SplitEditor, SplitStatusLine, type Participant } from "./split-editor";
import { emptyDraft, evaluateSplit, type SplitDraft, type ValueMethod } from "./split-math";
import { runAction } from "@/lib/client/run-action";

export interface ExpenseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contexts: ExpenseContexts;
  preset?: AddExpensePreset;
  /** When set, the sheet edits this expense instead of creating one. */
  editing?: ExpenseDetail;
}

/**
 * The form only exists while the sheet is open, so every opening starts from fresh state
 * (the preset, the expense being edited, or blank).
 */
export function ExpenseSheet(props: ExpenseSheetProps) {
  if (!props.open) return null;
  return <ExpenseSheetSession {...props} />;
}

// ---------------------------------------------------------------------------------------------

interface Target {
  key: string;
  kind: "group" | "friend";
  id: string;
  name: string;
  currency: string;
  participants: Participant[];
}

type FieldKey = "amount" | "description" | "paidById" | "date" | "category" | "notes" | "split" | "target";

function buildTargets(contexts: ExpenseContexts, editing?: ExpenseDetail): Target[] {
  const me = { id: contexts.me.id, name: contexts.me.name };
  const meFirst = (people: Participant[]) => [me, ...people.filter((p) => p.id !== me.id)];
  const targets: Target[] = [
    ...contexts.groups.map((g) => ({
      key: `g:${g.id}`,
      kind: "group" as const,
      id: g.id,
      name: g.name,
      currency: g.currency,
      participants: meFirst(g.members.map((m) => ({ id: m.id, name: m.name }))),
    })),
    ...contexts.friends.map((f) => ({
      key: `f:${f.id}`,
      kind: "friend" as const,
      id: f.id,
      name: f.name,
      currency: f.currency,
      participants: [me, { id: f.id, name: f.name }],
    })),
  ];

  // The expense being edited may belong to a context the shell no longer lists (e.g. an ex-friend).
  if (editing) {
    const key = editingKey(editing);
    const existing = targets.find((t) => t.key === key);
    if (existing) {
      existing.currency = editing.currency;
      // People who have since left the group are still on this expense: keep them (and their
      // amounts) in the form, so saving an unrelated change doesn't quietly drop their share.
      const current = new Set(existing.participants.map((p) => p.id));
      const former = new Map<string, Participant>();
      for (const s of editing.shares) {
        if (!current.has(s.user.id)) former.set(s.user.id, { id: s.user.id, name: `${s.user.name} (left the group)` });
      }
      if (!current.has(editing.paidBy.id)) {
        former.set(editing.paidBy.id, { id: editing.paidBy.id, name: `${editing.paidBy.name} (left the group)` });
      }
      if (former.size) existing.participants = [...existing.participants, ...former.values()];
    } else if (key) {
      const people = new Map<string, Participant>();
      for (const s of editing.shares) people.set(s.user.id, { id: s.user.id, name: s.user.name });
      people.set(editing.paidBy.id, { id: editing.paidBy.id, name: editing.paidBy.name });
      const friend = editing.friendId ? people.get(editing.friendId) : undefined;
      targets.push({
        key,
        kind: editing.group ? "group" : "friend",
        id: editing.group?.id ?? editing.friendId ?? "",
        name: editing.group?.name ?? friend?.name ?? "your friend",
        currency: editing.currency,
        participants: meFirst([...people.values()]),
      });
    }
  }
  return targets;
}

function editingKey(e: ExpenseDetail) {
  if (e.groupId) return `g:${e.groupId}`;
  if (e.friendId) return `f:${e.friendId}`;
  return "";
}

function initialTargetKey(targets: Target[], preset?: AddExpensePreset, editing?: ExpenseDetail): string {
  if (editing) return editingKey(editing);
  const wanted = preset?.groupId ? `g:${preset.groupId}` : preset?.friendId ? `f:${preset.friendId}` : "";
  if (wanted && targets.some((t) => t.key === wanted)) return wanted;
  return targets.length === 1 ? targets[0].key : "";
}

function trimNumber(n: number) {
  return String(Math.round(n * 100) / 100);
}

function draftFromExpense(e: ExpenseDetail, participantIds: string[]): SplitDraft {
  const draft = emptyDraft(participantIds, e.splitMethod);
  const byUser = new Map(e.shares.map((s) => [s.user.id, s]));
  for (const id of participantIds) {
    const s = byUser.get(id);
    draft.included[id] = Boolean(s && (s.amountCents > 0 || (s.percentage ?? 0) > 0 || (s.shares ?? 0) > 0));
    if (!s) continue;
    if (e.splitMethod === "exact") draft.exact[id] = centsToInput(s.amountCents);
    if (e.splitMethod === "percentage" && s.percentage != null) draft.percentage[id] = trimNumber(s.percentage);
    if (e.splitMethod === "shares" && s.shares != null) draft.shares[id] = trimNumber(s.shares);
  }
  return draft;
}

function toFieldKey(serverKey: string): FieldKey | null {
  if (serverKey === "amountCents") return "amount";
  if (serverKey.startsWith("split")) return "split";
  if (serverKey === "groupId" || serverKey === "friendId") return "target";
  if (["description", "paidById", "date", "category", "notes"].includes(serverKey)) return serverKey as FieldKey;
  return null;
}

function ExpenseSheetSession({ onOpenChange, contexts, preset, editing }: ExpenseSheetProps) {
  const formId = useId();
  const me = contexts.me;
  const targets = useMemo(() => buildTargets(contexts, editing), [contexts, editing]);

  const [targetKey, setTargetKey] = useState(() => initialTargetKey(targets, preset, editing));
  const target = targets.find((t) => t.key === targetKey);
  const participantIds = useMemo(() => target?.participants.map((p) => p.id) ?? [], [target]);

  const [amountText, setAmountText] = useState(() => (editing ? centsToInput(editing.amountCents) : ""));
  const [description, setDescription] = useState(editing?.description ?? "");
  const [paidById, setPaidById] = useState(editing?.paidBy.id ?? me.id);
  const [date, setDate] = useState(() => editing?.date ?? todayInput());
  const [category, setCategory] = useState<ExpenseCategory>(() => (editing && isCategory(editing.category) ? editing.category : "general"));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(Boolean(editing?.notes));
  const [draft, setDraft] = useState<SplitDraft>(() => (editing ? draftFromExpense(editing, participantIds) : emptyDraft(participantIds)));
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  const currency = target?.currency ?? "USD";
  const trimmedAmount = amountText.trim();
  const amountCents = trimmedAmount === "" ? null : parseAmountToCents(trimmedAmount);
  const amountUnreadable = trimmedAmount !== "" && amountCents === null;

  const split = useMemo(
    () => evaluateSplit({ amountCents, draft, participantIds, paidById, currency }),
    [amountCents, draft, participantIds, paidById, currency],
  );
  const canSave = Boolean(target) && amountCents !== null && amountCents > 0 && split.valid && !pending;

  const clearError = (key: FieldKey) => {
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    if (formError) setFormError(null);
  };

  function chooseTarget(key: string) {
    const next = targets.find((t) => t.key === key);
    setTargetKey(key);
    setPaidById(me.id);
    setDraft(emptyDraft(next?.participants.map((p) => p.id) ?? []));
    setErrors({});
    setFormError(null);
  }

  function setMethod(method: SplitMethod) {
    clearError("split");
    setDraft((d) => ({ ...d, method }));
  }

  function toggle(userId: string, included: boolean) {
    clearError("split");
    setDraft((d) => {
      const next = { ...d, included: { ...d.included, [userId]: included } };
      // Re-including someone in a shares split with no weight gives them one share.
      if (included && !(d.shares[userId] ?? "").trim()) next.shares = { ...d.shares, [userId]: "1" };
      return next;
    });
  }

  function setValue(method: ValueMethod, userId: string, text: string) {
    clearError("split");
    setDraft((d) => ({ ...d, [method]: { ...d[method], [userId]: text } }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target || !canSave || amountCents === null) return;

    const local: Partial<Record<FieldKey, string>> = {};
    if (!description.trim()) local.description = "Describe the expense.";
    if (!date) local.date = "Choose a date.";
    if (local.description || local.date) {
      setErrors(local);
      if (local.description) descriptionRef.current?.focus();
      return;
    }

    const input: ExpenseInput = {
      ...(target.kind === "group" ? { groupId: target.id } : { friendId: target.id }),
      description: description.trim(),
      amountCents,
      paidById,
      date,
      category,
      notes: notes.trim() || undefined,
      split: { method: draft.method, entries: split.entries },
    };

    startTransition(async () => {
      const result = editing
        ? await runAction(() => updateExpenseAction(editing.id, input))
        : await runAction(() => createExpenseAction(input));
      if (!result.ok) {
        const mapped: Partial<Record<FieldKey, string>> = {};
        for (const [key, message] of Object.entries(result.fieldErrors ?? {})) {
          const field = toFieldKey(key);
          if (field && !mapped[field]) mapped[field] = message;
        }
        setErrors(mapped);
        // Show the message once: on its field when we have one, otherwise above the form.
        const shownOnField = Object.values(mapped).includes(result.error);
        setFormError(shownOnField ? null : result.error);
        if (mapped.amount) amountRef.current?.focus();
        else if (mapped.description) descriptionRef.current?.focus();
        return;
      }
      toast.success("Expense saved");
      onOpenChange(false);
    });
  }

  const contextLine = target ? (target.kind === "group" ? `In ${target.name}` : `With ${target.name}`) : "Split a cost with a group or a friend.";
  const groupTargets = targets.filter((t) => t.kind === "group");
  const friendTargets = targets.filter((t) => t.kind === "friend");

  const footer = (
    <>
      {formError ? (
        <div className="mb-3">
          <FormError message={formError} />
        </div>
      ) : null}
      {target ? <SplitStatusLine status={split.status} /> : null}
      <Button type="submit" form={formId} size="lg" className="w-full" disabled={!canSave}>
        {pending ? "Saving…" : "Save expense"}
      </Button>
    </>
  );

  return (
    <Sheet open onOpenChange={onOpenChange} title={editing ? "Edit expense" : "Add expense"} description={contextLine} footer={footer}>
      <form id={formId} onSubmit={submit} noValidate className="space-y-4" aria-busy={pending || undefined}>
        {!editing ? (
          <Field
            label="Split with"
            error={errors.target}
            hint={target ? undefined : "Choose a group or a friend first."}
          >
            {(p) => (
              <Select
                {...p}
                value={targetKey}
                onChange={(e) => chooseTarget(e.target.value)}
                autoFocus={!target}
              >
                {!target ? (
                  <option value="" disabled>
                    Choose a group or friend
                  </option>
                ) : null}
                {groupTargets.length > 0 ? (
                  <optgroup label="Groups">
                    {groupTargets.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {friendTargets.length > 0 ? (
                  <optgroup label="Friends">
                    {friendTargets.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </Select>
            )}
          </Field>
        ) : null}

        {target ? (
          <>
            <Field
              label={
                <>
                  Amount<span className="sr-only"> in {currencyName(currency)}</span>
                </>
              }
              error={errors.amount ?? (amountUnreadable ? "Enter an amount like 12.50." : undefined)}
            >
              {(p) => (
                <div
                  className={cn(
                    "flex h-16 items-center rounded-[10px] border border-field bg-surface px-3.5",
                    "focus-within:border-focus focus-within:outline-2 focus-within:outline-offset-0 focus-within:outline-focus",
                    p["aria-invalid"] && "border-owe",
                  )}
                >
                  <span aria-hidden className="mr-1 text-heading font-semibold text-ink-muted">
                    {currencySymbol(currency)}
                  </span>
                  <input
                    {...p}
                    ref={amountRef}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0.00"
                    autoFocus
                    value={amountText}
                    onChange={(e) => {
                      clearError("amount");
                      setAmountText(e.target.value);
                    }}
                    className="hero-figure w-full min-w-0 bg-transparent text-[2rem] text-ink outline-none placeholder:text-ink-muted focus-visible:outline-none"
                  />
                </div>
              )}
            </Field>

            <Field label="Description" error={errors.description}>
              {(p) => (
                <Input
                  {...p}
                  ref={descriptionRef}
                  value={description}
                  maxLength={100}
                  autoComplete="off"
                  placeholder="Dinner, rent, taxi…"
                  onChange={(e) => {
                    clearError("description");
                    setDescription(e.target.value);
                  }}
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Paid by" error={errors.paidById} className="min-w-0">
                {(p) => (
                  <Select
                    {...p}
                    value={paidById}
                    onChange={(e) => {
                      clearError("paidById");
                      clearError("split");
                      setPaidById(e.target.value);
                    }}
                  >
                    {target.participants.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.id === me.id ? "You" : person.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Date" error={errors.date} className="min-w-0">
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    className="num"
                    value={date}
                    onChange={(e) => {
                      clearError("date");
                      setDate(e.target.value);
                    }}
                  />
                )}
              </Field>
            </div>

            <Field label="Category" error={errors.category}>
              {(p) => (
                <Select
                  {...p}
                  value={category}
                  onChange={(e) => {
                    clearError("category");
                    if (isCategory(e.target.value)) setCategory(e.target.value);
                  }}
                >
                  {CATEGORY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <SplitEditor
              participants={target.participants}
              meId={me.id}
              currency={currency}
              draft={draft}
              preview={split.preview}
              invalid={split.invalid}
              error={errors.split}
              onMethodChange={setMethod}
              onToggle={toggle}
              onValueChange={setValue}
            />

            {notesOpen ? (
              <Field label="Note" hint="Optional. Everyone on this expense can see it." error={errors.notes}>
                {(p) => (
                  <Textarea
                    {...p}
                    ref={notesRef}
                    value={notes}
                    maxLength={500}
                    onChange={(e) => {
                      clearError("notes");
                      setNotes(e.target.value);
                    }}
                  />
                )}
              </Field>
            ) : (
              <Button
                variant="ghost"
                className="-ml-2 px-2"
                onClick={() => {
                  setNotesOpen(true);
                  requestAnimationFrame(() => notesRef.current?.focus());
                }}
              >
                <Plus aria-hidden />
                Add a note
              </Button>
            )}
          </>
        ) : null}

      </form>
    </Sheet>
  );
}
