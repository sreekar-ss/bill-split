"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" disabled={pending}>
      <LogOut aria-hidden />
      {pending ? "Logging out…" : "Log out"}
    </Button>
  );
}

/** Posts the logout Server Action; works before hydration too. */
export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Submit />
    </form>
  );
}
