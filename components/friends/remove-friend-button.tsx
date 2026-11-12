"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { removeFriendAction } from "@/app/actions/friends";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/client/run-action";
import { displayName, type PersonStatus } from "@/lib/utils/person";

export function RemoveFriendButton({ friend }: { friend: { id: string; name: string; status?: PersonStatus | null } }) {
  const name = displayName(friend);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await runAction(() => removeFriendAction(friend.id));
      if (result.ok) {
        setOpen(false);
        toast.success("Friend removed");
        router.push("/friends");
      } else {
        setError(result.error);
      }
    });
  };

  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Remove friend
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
        title={`Remove ${name}?`}
        body={
          <span className="block space-y-3">
            <span className="block">
              {name} will leave your friends list. Groups you share aren&apos;t affected. You can only do this when nothing is
              owed between you directly.
            </span>
            {/* The dialog description is a <p>, so this mirrors FormError with a span instead. */}
            {error ? (
              <span role="alert" className="block rounded-[10px] border border-owe/30 bg-owe/5 px-3 py-2 text-owe">
                {error}
              </span>
            ) : null}
          </span>
        }
        confirmLabel="Remove friend"
        onConfirm={confirm}
        pending={pending}
      />
    </>
  );
}
