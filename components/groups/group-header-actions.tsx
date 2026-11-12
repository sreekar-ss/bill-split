"use client";

import { Settings, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AddMemberSheet } from "./add-member-form";
import { GroupSettingsSheet, type GroupSettingsData } from "./group-settings-sheet";

/** Header buttons on the group page: Add member (icon on phones, labelled from md) and Group settings. */
export function GroupHeaderActions({ group, meId }: { group: GroupSettingsData; meId: string }) {
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState(false);
  return (
    <>
      <Button variant="secondary" className="w-11 px-0 md:w-auto md:px-4" onClick={() => setAdding(true)}>
        <UserPlus aria-hidden />
        <span className="sr-only md:not-sr-only">Add member</span>
      </Button>
      <Button variant="ghost" size="icon" aria-label="Group settings" onClick={() => setSettings(true)}>
        <Settings aria-hidden />
      </Button>
      <AddMemberSheet open={adding} onOpenChange={setAdding} groupId={group.id} groupName={group.name} />
      <GroupSettingsSheet open={settings} onOpenChange={setSettings} group={group} meId={meId} />
    </>
  );
}
