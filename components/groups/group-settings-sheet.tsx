"use client";

import { Archive, ArchiveRestore, Download, LogOut, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveGroupAction, deleteGroupAction, removeMemberAction, updateGroupAction } from "@/app/actions/groups";
import { useFocusFirstError } from "@/components/auth/use-focus-first-error";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { formatMoney, SUPPORTED_CURRENCIES } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";
import { displayName, isInvited, type PersonStatus } from "@/lib/utils/person";
import { AddMemberForm } from "./add-member-form";
import { useUnarchive } from "./archive-controls";
import { EmojiPicker } from "./emoji-picker";
import { avatarName } from "./format";
import { runAction } from "@/lib/client/run-action";

export interface GroupSettingsData {
  id: string;
  name: string;
  currency: string;
  /** The group's emoji, or null for initials. */
  icon: string | null;
  /** Archived groups are read-only: no members added or removed, no expenses or payments. */
  archived: boolean;
  isAdmin: boolean;
  /** True once the group has expenses or payments: the currency can't change after that. */
  currencyLocked: boolean;
  /** Everyone is settled up (a group can only be deleted then). */
  settled: boolean;
  members: { id: string; name: string; email: string; role: string; netCents: number; status?: PersonStatus | null }[];
}

type Confirm =
  | { kind: "remove"; member: { id: string; name: string; invited: boolean } }
  | { kind: "leave" }
  | { kind: "delete" }
  | { kind: "archive" }
  | null;

export function GroupSettingsSheet({
  open,
  onOpenChange,
  group,
  meId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: GroupSettingsData;
  meId: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Group settings" description={group.name}>
      <div className="space-y-8 pb-2">
        <DetailsForm group={group} />
        <MembersSection group={group} meId={meId} onClose={() => onOpenChange(false)} />
      </div>
    </Sheet>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-[1.0625rem] font-bold">{children}</h3>;
}

function DetailsForm({ group }: { group: GroupSettingsData }) {
  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(group.currency);
  const [icon, setIcon] = useState(group.icon ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [failures, setFailures] = useState(0);
  const formRef = useFocusFirstError(failures);
  const dirty = name.trim() !== group.name || currency !== group.currency || icon !== (group.icon ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setErrors({ name: "Give the group a name." });
      setFailures((n) => n + 1);
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await runAction(() => updateGroupAction(group.id, { name: name.trim(), icon, ...(group.currencyLocked ? {} : { currency }) }));
      if (res.ok) {
        toast.success("Changes saved");
      } else {
        const fe = res.fieldErrors ?? {};
        setErrors(fe);
        // An emoji error has no field of its own to sit on: it shows above the form.
        setFormError(fe.name || fe.currency ? null : (fe.icon ?? res.error));
        setFailures((n) => n + 1);
      }
    });
  }

  return (
    <section aria-labelledby="group-details-h">
      <SubHeading>
        <span id="group-details-h">Details</span>
      </SubHeading>
      <form ref={formRef} onSubmit={submit} noValidate className="space-y-4">
        <FormError message={formError} />
        <Field label="Group name" error={errors.name}>
          {(p) => <Input {...p} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field
          label="Currency"
          hint={
            group.currencyLocked
              ? "The currency can't change once the group has expenses or payments."
              : "Expenses in this group are recorded in this currency."
          }
          error={errors.currency}
        >
          {(p) => (
            <Select {...p} value={currency} disabled={group.currencyLocked} onChange={(e) => setCurrency(e.target.value)}>
              {SUPPORTED_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <EmojiPicker value={icon} onChange={setIcon} disabled={pending} />
        <Button type="submit" variant="secondary" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </section>
  );
}

function memberBalance(cents: number, currency: string) {
  if (cents > 0) return { text: `gets back ${formatMoney(cents, currency)}`, cls: "text-owed" };
  if (cents < 0) return { text: `owes ${formatMoney(cents, currency, { abs: true })}`, cls: "text-owe" };
  return { text: "settled up", cls: "text-ink-muted" };
}

function MembersSection({ group, meId, onClose }: { group: GroupSettingsData; meId: string; onClose: () => void }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { unarchive, pending: unarchiving } = useUnarchive(group.id, onClose);

  const openConfirm = (c: Confirm) => {
    setConfirmError(null);
    setConfirm(c);
  };

  function runConfirm() {
    if (!confirm) return;
    const current = confirm;
    setConfirmError(null);
    startTransition(async () => {
      if (current.kind === "remove") {
        const res = await runAction(() => removeMemberAction(group.id, current.member.id));
        if (!res.ok) return setConfirmError(res.error);
        toast.success("Member removed", { description: "The group's invite link has changed, so older links no longer work." });
        setConfirm(null);
      } else if (current.kind === "leave") {
        const res = await runAction(() => removeMemberAction(group.id, meId));
        if (!res.ok) return setConfirmError(res.error);
        toast.success("You left the group");
        setConfirm(null);
        onClose();
        router.replace("/groups");
      } else if (current.kind === "archive") {
        // Only offered when settled; if a balance opened up since the page loaded, the service's own
        // copy ("Settle up everyone's balance…") is shown in the dialog.
        const res = await runAction(() => archiveGroupAction(group.id));
        if (!res.ok) return setConfirmError(res.error);
        toast.success("Group archived", { description: "It's read-only now, under Archived in your groups." });
        setConfirm(null);
        onClose();
      } else {
        const res = await runAction(() => deleteGroupAction(group.id));
        if (!res.ok) return setConfirmError(res.error);
        toast.success("Group deleted");
        setConfirm(null);
        onClose();
        router.replace("/groups");
      }
    });
  }

  const dialog =
    confirm?.kind === "remove"
      ? {
          title: `Remove ${confirm.member.name}?`,
          body: confirm.member.invited
            ? `They won't be able to join ${group.name} from their invite email. Expenses they were part of stay in the ledger. The group's invite link also changes, so links shared earlier stop working.`
            : `They'll lose access to ${group.name}. Expenses they were part of stay in the ledger. The group's invite link also changes, so links shared earlier stop working.`,
          label: "Remove member",
        }
      : confirm?.kind === "leave"
        ? {
            title: `Leave ${group.name}?`,
            body: "You'll stop seeing this group. You can leave once your balance here is settled up.",
            label: "Leave group",
          }
        : confirm?.kind === "archive"
          ? {
              title: `Archive ${group.name}?`,
              body: "It moves to Archived at the bottom of the groups list, for everyone in it. Nobody can add or change expenses or payments until someone unarchives it.",
              label: "Archive group",
            }
          : {
            title: `Delete ${group.name}?`,
            body: group.settled
              ? "This deletes the group and all of its expenses and payments, for everyone in it. It can't be undone."
              : "Someone in this group still has an unsettled balance. Settle up everyone before deleting the group.",
            label: "Delete group",
          };

  return (
    <>
      <section aria-labelledby="group-members-h">
        <SubHeading>
          <span id="group-members-h">Members</span>
        </SubHeading>
        <ul className="border-t border-rule">
          {group.members.map((m) => {
            const bal = memberBalance(m.netCents, group.currency);
            const isMe = m.id === meId;
            const label = displayName(m);
            const deleted = m.status === "deleted";
            return (
              <li key={m.id} className="flex min-h-16 items-center gap-3 border-b border-rule py-2.5">
                <Avatar id={m.id} name={avatarName(m)} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {isMe ? `${label} (you)` : label}
                    {m.role === "admin" ? <span className="ml-2 text-meta font-normal text-ink-muted">admin</span> : null}
                  </span>
                  {deleted || !m.email ? null : (
                    <span className="block truncate text-meta text-ink-muted">
                      {isInvited(m) ? `Invite sent to ${m.email}` : m.email}
                    </span>
                  )}
                  <span className={cn("block text-meta", bal.cls)}>{bal.text}</span>
                </span>
                {group.isAdmin && !isMe && !group.archived ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-11"
                    aria-label={`Remove ${label}`}
                    onClick={() => openConfirm({ kind: "remove", member: { id: m.id, name: label, invited: isInvited(m) } })}
                  >
                    Remove
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {group.archived ? (
          <p className="mt-4 text-body-sm text-ink-muted">Members can&apos;t be added or removed while the group is archived.</p>
        ) : (
          <div className="mt-5">
            <AddMemberForm groupId={group.id} />
          </div>
        )}
      </section>

      <section aria-labelledby="group-export-h" className="border-t border-rule pt-6">
        <SubHeading>
          <span id="group-export-h">Export</span>
        </SubHeading>
        <p className="text-body-sm text-ink-muted">Download every expense and payment in this group as a spreadsheet (CSV).</p>
        <a href={`/api/groups/${group.id}/export`} download className={cn(buttonVariants({ variant: "secondary" }), "mt-3")}>
          <Download aria-hidden />
          Export CSV
        </a>
      </section>

      <section aria-labelledby="group-archive-h" className="border-t border-rule pt-6">
        <SubHeading>
          <span id="group-archive-h">{group.archived ? "Archived" : "Archive"}</span>
        </SubHeading>
        {group.archived ? (
          <>
            <p className="text-body-sm text-ink-muted">This group is read-only. Unarchive it to add expenses and payments again.</p>
            <Button
              variant="secondary"
              className="mt-3 aria-disabled:opacity-45"
              aria-disabled={unarchiving || undefined}
              onClick={() => !unarchiving && unarchive()}
            >
              <ArchiveRestore aria-hidden />
              {unarchiving ? "Unarchiving…" : "Unarchive group"}
            </Button>
          </>
        ) : (
          <>
            <p className="text-body-sm text-ink-muted">
              Finished with this group? Archiving hides it under Archived in the groups list and makes it read-only. Everyone needs to be settled up first.
            </p>
            {/* An open balance would make the server refuse: don't offer a step that can't succeed. */}
            <Button
              variant="secondary"
              className="mt-3"
              disabled={!group.settled}
              aria-describedby={group.settled ? undefined : "group-archive-blocked"}
              onClick={() => openConfirm({ kind: "archive" })}
            >
              <Archive aria-hidden />
              Archive group
            </Button>
            {group.settled ? null : (
              <p id="group-archive-blocked" className="mt-2 text-body-sm text-ink">
                Settle up everyone first. Then you can archive the group.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="group-leave-h" className="border-t border-rule pt-6">
        <h3 id="group-leave-h" className="sr-only">
          Leave or delete
        </h3>
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" onClick={() => openConfirm({ kind: "leave" })}>
            <LogOut aria-hidden />
            Leave group
          </Button>
          {group.isAdmin ? (
            <Button variant="destructive" onClick={() => openConfirm({ kind: "delete" })}>
              <Trash2 aria-hidden />
              Delete group
            </Button>
          ) : null}
        </div>
      </section>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => {
          if (!o) setConfirm(null);
        }}
        title={dialog.title}
        body={
          <>
            {dialog.body}
            {confirmError ? (
              <span role="alert" className="mt-3 block font-medium text-owe">
                {confirmError}
              </span>
            ) : null}
          </>
        }
        confirmLabel={dialog.label}
        onConfirm={runConfirm}
        pending={pending}
        tone={confirm?.kind === "archive" ? "neutral" : "danger"}
      />
    </>
  );
}
