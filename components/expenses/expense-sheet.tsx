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
import { endsOnError, NO_REPEAT, RepeatFields, toRecurrence, type RepeatDraft } from "./repeat-fields";
import { runAction, UNREACHABLE_ERROR } from "@/lib/client/run-action";
import { enqueueExpense, listQueuedExpenses, newClientId, removeQueuedExpense, type QueuedExpense } from "@/lib/pwa/offline-queue";
import { displayName } from "@/lib/utils/person";

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

type FieldKey = "amount" | "description" | "paidById" | "date" | "category" | "notes" | "split" | "target" | "interval" | "endsOn";

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
      participants: meFirst(g.members.map((m) => ({ id: m.id, name: displayName(m) }))),
    })),
    ...contexts.friends.map((f) => ({
      key: `f:${f.id}`,
      kind: "friend" as const,
      id: f.id,
      name: displayName(f),
      currency: f.currency,
      participants: [me, { id: f.id, name: displayName(f) }],
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
  const from = preset?.draft?.input ?? preset;
  const wanted = from?.groupId ? `g:${from.groupId}` : from?.friendId ? `f:${from.friendId}` : "";
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

/** A queued expense's split, back in the form's shape (when its group or friend is still offered). */
function draftFromQueued(q: QueuedExpense, participantIds: string[]): SplitDraft {
  const { method, entries } = q.input.split;
  const draft = emptyDraft(participantIds, method);
  const byUser = new Map(entries.map((e) => [e.userId, e]));
  for (const id of participantIds) {
    const e = byUser.get(id);
    draft.included[id] = Boolean(e);
    if (!e || e.value == null) continue;
    if (method === "exact") draft.exact[id] = centsToInput(e.value);
    if (method === "percentage") draft.percentage[id] = trimNumber(e.value);
    if (method === "shares") draft.shares[id] = trimNumber(e.value);
  }
  return draft;
}

/** Another expense already waiting on this device that looks like the same one (likely re-entered). */
async function findQueuedTwin(userId: string, input: ExpenseInput, clientId: string): Promise<QueuedExpense | null> {
  try {
    const items = await listQueuedExpenses();
    return (
      items.find(
        (q) =>
          q.userId === userId &&
          q.clientId !== clientId &&
          q.input.amountCents === input.amountCents &&
          (q.input.groupId ?? null) === (input.groupId ?? null) &&
          (q.input.friendId ?? null) === (input.friendId ?? null) &&
          q.input.description.trim().toLowerCase() === input.description.trim().toLowerCase(),
      ) ?? null
    );
  } catch {
    return null;
  }
}

function toFieldKey(serverKey: string): FieldKey | null {
  if (serverKey === "amountCents") return "amount";
  if (serverKey.startsWith("split")) return "split";
  if (serverKey === "groupId" || serverKey === "friendId") return "target";
  if (["description", "paidById", "date", "category", "notes", "interval", "endsOn"].includes(serverKey)) return serverKey as FieldKey;
  return null;
}

/** Repeating expenses are set up on the server, so they can't wait in the offline queue. */
const REPEAT_NEEDS_CONNECTION =
  "Repeating expenses need a connection. Try again when you're back online, or set Repeat to Never to save it on this device.";
const SAVED_OFFLINE = "Saved offline. We'll add it when you're back online.";

function ExpenseSheetSession({ onOpenChange, contexts, preset, editing }: ExpenseSheetProps) {
  const formId = useId();
  // Reviewing an expense saved on this device that the server refused (see OfflineSyncProvider).
  const queued = editing ? undefined : preset?.draft;
  const q = queued?.input;
  const me = contexts.me;
  const targets = useMemo(() => buildTargets(contexts, editing), [contexts, editing]);

  const [targetKey, setTargetKey] = useState(() => initialTargetKey(targets, preset, editing));
  const target = targets.find((t) => t.key === targetKey);
  const participantIds = useMemo(() => target?.participants.map((p) => p.id) ?? [], [target]);

  // A queued draft's people only apply if its group or friend is still the one selected.
  const queuedTargetKept = Boolean(q && target && (q.groupId ? `g:${q.groupId}` : `f:${q.friendId}`) === target.key);
  const [amountText, setAmountText] = useState(() => (editing ? centsToInput(editing.amountCents) : q ? centsToInput(q.amountCents) : ""));
  const [description, setDescription] = useState(editing?.description ?? q?.description ?? "");
  const [paidById, setPaidById] = useState(() =>
    editing ? editing.paidBy.id : q && queuedTargetKept && participantIds.includes(q.paidById) ? q.paidById : me.id,
  );
  const [date, setDate] = useState(() => editing?.date ?? q?.date ?? todayInput());
  const [category, setCategory] = useState<ExpenseCategory>(() => {
    const c = editing?.category ?? q?.category;
    return c && isCategory(c) ? c : "general";
  });
  const [notes, setNotes] = useState(editing?.notes ?? q?.notes ?? "");
  const [notesOpen, setNotesOpen] = useState(Boolean(editing?.notes ?? q?.notes));
  const [draft, setDraft] = useState<SplitDraft>(() =>
    editing
      ? draftFromExpense(editing, participantIds)
      : queued && queuedTargetKept
        ? draftFromQueued(queued, participantIds)
        : emptyDraft(participantIds),
  );
  const [repeat, setRepeat] = useState<RepeatDraft>(NO_REPEAT);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  // A refused queued expense opens with the server's reason, so it's clear what to change.
  const [formError, setFormError] = useState<string | null>(() => queued?.failed?.error ?? null);
  /** Set once we've warned that a similar expense is already waiting on this device. */
  const [twinWarned, setTwinWarned] = useState(false);
  const [pending, startTransition] = useTransition();
  // One id per new expense, kept across retries, so a save that reached the server (or is replayed
  // from the offline queue) is only ever added once. A reviewed queued item keeps its own id.
  const [clientId] = useState(() => (editing ? undefined : (queued?.clientId ?? newClientId())));

  const descriptionRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const endsOnRef = useRef<HTMLInputElement>(null);
  const intervalRef = useRef<HTMLSelectElement>(null);

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
    if (twinWarned) setTwinWarned(false);
  };

  function chooseTarget(key: string) {
    const next = targets.find((t) => t.key === key);
    setTargetKey(key);
    setPaidById(me.id);
    setDraft(emptyDraft(next?.participants.map((p) => p.id) ?? []));
    setErrors({});
    setFormError(null);
    setTwinWarned(false);
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
    const recurrence = editing ? undefined : toRecurrence(repeat);
    const endsOnProblem = recurrence ? endsOnError(repeat, date) : undefined;
    if (endsOnProblem) local.endsOn = endsOnProblem;
    if (local.description || local.date || local.endsOn) {
      setErrors(local);
      if (local.description) descriptionRef.current?.focus();
      else if (local.endsOn) endsOnRef.current?.focus();
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
      ...(clientId ? { clientId } : {}),
    };

    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    if (!editing && offline && recurrence) {
      setErrors({});
      setFormError(REPEAT_NEEDS_CONNECTION);
      return;
    }

    /** Keep a new expense on this device for later. False when the device can't store it either. */
    async function saveOffline(): Promise<boolean> {
      if (!clientId || !target) return false;
      try {
        await enqueueExpense(
          me.id,
          { ...input, clientId },
          { where: target.kind === "group" ? `In ${target.name}` : `With ${target.name}`, currency: target.currency },
        );
      } catch (error) {
        console.error("[offline] couldn't queue the expense", error);
        return false;
      }
      toast(SAVED_OFFLINE);
      onOpenChange(false);
      return true;
    }

    startTransition(async () => {
      // Offline saves are invisible in the ledger until they sync, so people re-enter them. Warn once.
      if (!editing && clientId && !twinWarned) {
        const twin = await findQueuedTwin(me.id, input, clientId);
        if (twin) {
          setErrors({});
          setTwinWarned(true);
          setFormError(`You already saved '${twin.input.description}' for this amount on this device. It's waiting to sync. Save it again anyway?`);
          return;
        }
      }
      if (!editing && offline) {
        if (!(await saveOffline())) {
          setErrors({});
          setFormError(UNREACHABLE_ERROR);
        }
        return;
      }
      const result = editing
        ? await runAction(() => updateExpenseAction(editing.id, input))
        : await runAction(() => createExpenseAction(input, recurrence));
      if (!result.ok && !editing && result.error === UNREACHABLE_ERROR) {
        if (recurrence) {
          setErrors({});
          setFormError(REPEAT_NEEDS_CONNECTION);
          return;
        }
        if (await saveOffline()) return;
      }
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
        else if (mapped.interval) intervalRef.current?.focus();
        else if (mapped.endsOn) endsOnRef.current?.focus();
        return;
      }
      // A reviewed queued item is saved now: it no longer belongs on the device.
      if (queued) await removeQueuedExpense(queued.clientId).catch(() => {});
      toast.success(recurrence ? "Recurring expense saved" : "Expense saved");
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
        {pending ? "Saving…" : twinWarned ? "Save it again" : "Save expense"}
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

        {editing?.recurring && editing.recurring.state !== "stopped" ? (
          <p className="rounded-[10px] border border-rule bg-paper px-3 py-2 text-body-sm text-ink-muted">
            This expense repeats. Changes here apply to this one only, not to the ones still to come.
          </p>
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
                      clearError("endsOn");
                      setDate(e.target.value);
                    }}
                  />
                )}
              </Field>
            </div>

            {!editing ? (
              <RepeatFields
                value={repeat}
                date={date}
                errors={{ interval: errors.interval, endsOn: errors.endsOn }}
                endsOnRef={endsOnRef}
                intervalRef={intervalRef}
                onChange={(next) => {
                  if (next.interval !== repeat.interval || next.frequency !== repeat.frequency) clearError("interval");
                  if (next.endsOn !== repeat.endsOn || next.frequency !== repeat.frequency) clearError("endsOn");
                  setRepeat(next);
                }}
              />
            ) : null}

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
