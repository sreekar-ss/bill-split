"use client";

import { Copy, RotateCcw, Share2 } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore, useTransition } from "react";
import { toast } from "sonner";
import { getInviteLinkAction, resetInviteLinkAction } from "@/app/actions/invites";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormError, Input, Label } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/page";
import { runAction } from "@/lib/client/run-action";

type LinkState = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

async function fetchLink(groupId: string): Promise<LinkState> {
  const res = await runAction(() => getInviteLinkAction(groupId));
  return res.ok ? { status: "ready", url: res.data.url } : { status: "error", message: res.error };
}

// navigator.share exists only in the browser (and on few desktops): false on the server, checked on the client.
const noSubscribe = () => () => {};
const shareSupported = () => typeof navigator.share === "function";
const shareUnsupported = () => false;

/**
 * "Invite with a link": the group's join link with Copy / Share…, and for admins a Reset step
 * (which stops every earlier link working). The link is fetched each time the sheet opens.
 */
export function InviteLinkSheet({
  open,
  onOpenChange,
  groupId,
  groupName,
  isAdmin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  groupName: string;
  isAdmin: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Invite with a link" description="Share this link in your group chat.">
      {/* Sheet content unmounts when closed, so the link is loaded fresh on every open. */}
      <InviteLinkBody groupId={groupId} groupName={groupName} isAdmin={isAdmin} />
    </Sheet>
  );
}

function InviteLinkBody({ groupId, groupName, isAdmin }: { groupId: string; groupName: string; isAdmin: boolean }) {
  const inputId = useId();
  const [link, setLink] = useState<LinkState>({ status: "loading" });
  const canShare = useSyncExternalStore(noSubscribe, shareSupported, shareUnsupported);
  const [confirming, setConfirming] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetting, startReset] = useTransition();

  // Loaded on open (this body mounts with the sheet): an admin may have reset the link since.
  useEffect(() => {
    let live = true;
    void fetchLink(groupId).then((next) => live && setLink(next));
    return () => {
      live = false;
    };
  }, [groupId]);

  function retry() {
    setLink({ status: "loading" });
    void fetchLink(groupId).then(setLink);
  }

  const url = link.status === "ready" ? link.url : "";

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      // Clipboard access can be blocked (permissions, insecure context): leave the link selected to copy by hand.
      const input = document.getElementById(inputId);
      if (input instanceof HTMLInputElement) {
        input.focus();
        input.select();
      }
      toast.error("Couldn't copy the link. It's selected, so you can copy it yourself.");
    }
  }

  async function share() {
    if (!url) return;
    try {
      await navigator.share({ title: `Join ${groupName} on BillSplit`, text: `Join ${groupName} on BillSplit to split costs.`, url });
    } catch (error) {
      // Closing the share sheet rejects with AbortError: that's not a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't open sharing. Copy the link instead.");
    }
  }

  function reset() {
    setResetError(null);
    startReset(async () => {
      const res = await runAction(() => resetInviteLinkAction(groupId));
      if (!res.ok) return setResetError(res.error);
      setLink({ status: "ready", url: res.data.url });
      setConfirming(false);
      toast.success("Link reset", { description: "The old link no longer works." });
    });
  }

  return (
    <div className="space-y-5 pb-2">
      {link.status === "error" ? (
        <div className="space-y-3">
          <FormError message={link.message} />
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={inputId}>Invite link</Label>
          {link.status === "loading" ? (
            <div role="status" aria-busy="true">
              <span className="sr-only">Loading the invite link…</span>
              <Skeleton className="h-11 w-full rounded-[10px]" />
            </div>
          ) : (
            <Input
              id={inputId}
              readOnly
              value={url}
              aria-describedby={`${inputId}-hint`}
              onFocus={(e) => e.currentTarget.select()}
              className="text-body-sm"
            />
          )}
          <p id={`${inputId}-hint`} className="text-meta text-ink-muted">
            Anyone with this link can join {groupName}. They&apos;ll need to log in or create an account first.
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void copy()} disabled={!url} className="flex-1 sm:flex-none">
          <Copy aria-hidden />
          Copy link
        </Button>
        {canShare ? (
          <Button variant="secondary" onClick={() => void share()} disabled={!url} className="flex-1 sm:flex-none">
            <Share2 aria-hidden />
            Share…
          </Button>
        ) : null}
      </div>

      {isAdmin ? (
        <section aria-labelledby={`${inputId}-reset-h`} className="border-t border-rule pt-5">
          <h3 id={`${inputId}-reset-h`} className="text-[1.0625rem] font-bold">
            Reset the link
          </h3>
          <p className="mt-1 text-body-sm text-ink-muted">
            Shared it somewhere you shouldn&apos;t have? Resetting makes a new link, and the old one stops working.
          </p>
          <Button
            variant="destructive"
            className="mt-3"
            disabled={link.status !== "ready"}
            onClick={() => {
              setResetError(null);
              setConfirming(true);
            }}
          >
            <RotateCcw aria-hidden />
            Reset link
          </Button>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(o) => !resetting && setConfirming(o)}
        title="Reset the invite link?"
        body={
          <>
            The current link stops working straight away, including anywhere you&apos;ve already shared it. People already in{" "}
            {groupName} stay in the group.
            {resetError ? (
              <span role="alert" className="mt-3 block font-medium text-owe">
                {resetError}
              </span>
            ) : null}
          </>
        }
        confirmLabel="Reset link"
        onConfirm={reset}
        pending={resetting}
      />
    </div>
  );
}
