"use client";

import { Link2, Settings, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AddMemberSheet } from "./add-member-form";
import { GroupSettingsSheet, type GroupSettingsData } from "./group-settings-sheet";
import { InviteLinkSheet } from "./invite-link-sheet";

/**
 * Header buttons on the group page: Invite with a link and Add member (icons on phones, labelled
 * from md; hidden while the group is archived) and Group settings.
 */
export function GroupHeaderActions({ group, meId }: { group: GroupSettingsData; meId: string }) {
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [settings, setSettings] = useState(false);
  return (
    <>
      {/* An archived group is read-only: nobody joins or is added until it's unarchived. */}
      {group.archived ? null : (
        <>
          <Button variant="secondary" className="w-11 px-0 md:w-auto md:px-4" onClick={() => setInviting(true)}>
            <Link2 aria-hidden />
            <span className="sr-only md:not-sr-only">Invite with a link</span>
          </Button>
          <Button variant="secondary" className="w-11 px-0 md:w-auto md:px-4" onClick={() => setAdding(true)}>
            <UserPlus aria-hidden />
            <span className="sr-only md:not-sr-only">Add member</span>
          </Button>
        </>
      )}
      <Button variant="ghost" size="icon" aria-label="Group settings" onClick={() => setSettings(true)}>
        <Settings aria-hidden />
      </Button>
      <AddMemberSheet
        open={adding}
        onOpenChange={setAdding}
        groupId={group.id}
        groupName={group.name}
        onInviteWithLink={() => {
          setAdding(false);
          setInviting(true);
        }}
      />
      <InviteLinkSheet open={inviting} onOpenChange={setInviting} groupId={group.id} groupName={group.name} isAdmin={group.isAdmin} />
      <GroupSettingsSheet open={settings} onOpenChange={setSettings} group={group} meId={meId} />
    </>
  );
}
