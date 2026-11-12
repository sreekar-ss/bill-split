"use client";

import { MonitorSmartphone } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { logoutEverywhereAction } from "@/app/actions/account";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { runAction } from "@/lib/client/run-action";

/** Signs out every device, this one included. The action redirects to /login on success. */
export function LogoutEverywhereButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function logoutEverywhere() {
    startTransition(async () => {
      const result = await runAction(() => logoutEverywhereAction());
      if (result && !result.ok) {
        toast.error(result.error);
        setConfirming(false);
      }
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        <MonitorSmartphone aria-hidden />
        Log out of all devices
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !pending && setConfirming(open)}
        title="Log out of all devices?"
        body="You'll be logged out on every phone and computer, including this one. You can log back in with your email and password."
        confirmLabel="Log out everywhere"
        pending={pending}
        onConfirm={logoutEverywhere}
      />
    </>
  );
}
