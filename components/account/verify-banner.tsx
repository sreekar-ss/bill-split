"use client";

import { Mail, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useResendVerification } from "@/components/auth/use-resend-verification";
import { VERIFY_BANNER_COOKIE } from "@/components/auth/verify-banner-cookie";

/**
 * Slim, quiet reminder shown above page content while the email is unconfirmed.
 * Sits in the normal flow at the top of <main>, so it never covers the tab bar or the add pill.
 */
export function VerifyBanner({ email, userId }: { email: string; userId: string }) {
  const [hidden, setHidden] = useState(false);
  const { resend, pending } = useResendVerification();
  const pathname = usePathname();

  // Account shows the same status with its own "Resend link", so one reminder is enough there.
  if (hidden || pathname === "/account") return null;

  function dismiss() {
    try {
      document.cookie = `${VERIFY_BANNER_COOKIE}=${encodeURIComponent(userId)}; path=/; SameSite=Lax`;
    } catch {
      // Cookies blocked: it still hides for this page view.
    }
    setHidden(true);
    // The dismiss button is gone; land focus on the page heading instead of <body>.
    const target = document.querySelector<HTMLElement>("#main h1") ?? document.getElementById("main");
    if (target) {
      if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    }
  }

  return (
    <section
      aria-label="Confirm your email"
      className="mb-5 flex max-w-[720px] items-start gap-3 rounded-[10px] border border-rule bg-surface py-1 pl-3 pr-1"
      data-testid="verify-banner"
    >
      <Mail className="mt-3 size-[18px] shrink-0 text-ink-muted" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-center md:gap-4">
        <p className="pt-2.5 text-body-sm text-ink md:flex-1 md:py-2.5">
          Confirm your email so friends can find you. We sent a link to{" "}
          <span className="font-semibold [overflow-wrap:break-word]">{email}</span>.
        </p>
        <button
          type="button"
          onClick={resend}
          disabled={pending}
          className="inline-flex h-11 shrink-0 items-center self-start rounded-[10px] text-body-sm font-semibold text-ink underline underline-offset-4 disabled:opacity-60 md:self-auto md:px-2"
        >
          {pending ? "Sending link…" : "Resend link"}
        </button>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide this reminder"
        className="grid size-11 shrink-0 place-items-center rounded-[10px] text-ink-muted hover:bg-ink/5 hover:text-ink"
      >
        <X className="size-[18px]" aria-hidden />
      </button>
    </section>
  );
}
