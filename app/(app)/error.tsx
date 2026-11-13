"use client";

import { RotateCw } from "lucide-react";
import { AppLink } from "@/components/ui/app-link";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

/** Error boundary for signed-in pages. The shell (rail, tabs) stays put around it. */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  useEffect(() => {
    console.error(error);
    headingRef.current?.focus();
  }, [error]);

  return (
    <div className="max-w-[46ch] py-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-heading font-bold outline-none">
        This page didn&apos;t load
      </h1>
      <p className="mt-2 text-body-sm text-ink-muted">
        Something went wrong on our side. Your saved expenses and payments are safe. Try again, and if it keeps happening, come back
        in a few minutes.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button onClick={() => retry()}>
          <RotateCw aria-hidden />
          Try again
        </Button>
        <Button asChild variant="secondary">
          <AppLink href="/home">Go to home</AppLink>
        </Button>
      </div>
      {digest ? <p className="mt-6 text-meta text-ink-muted">Error reference: <span className="num">{digest}</span></p> : null}
    </div>
  );
}
