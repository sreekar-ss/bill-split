"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { joinGroupAction } from "@/app/actions/invites";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/field";
import { runAction } from "@/lib/client/run-action";

/** "Join group" -> joinGroupAction -> the group page. */
export function JoinButton({ token, groupName }: { token: string; groupName: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function join() {
    setError(null);
    startTransition(async () => {
      const res = await runAction(() => joinGroupAction(token));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(res.data.joined ? `You joined ${groupName}` : `You're already in ${groupName}`);
      router.push(`/groups/${res.data.groupId}`);
    });
  }

  return (
    <div className="space-y-3">
      <FormError message={error} />
      <Button size="lg" className="w-full" onClick={join} disabled={pending}>
        {pending ? "Joining…" : "Join group"}
      </Button>
    </div>
  );
}
