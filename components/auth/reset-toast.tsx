"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

/** Confirms a completed password reset once, then removes ?reset=1 from the URL. */
export function ResetToast() {
  const params = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (params.get("reset") === "1") {
      toast.success("Password changed. You're logged in.");
      router.replace("/home", { scroll: false });
    }
  }, [params, router]);
  return null;
}
