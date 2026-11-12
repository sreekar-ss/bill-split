"use client";

import "./globals.css";

/**
 * Last-resort boundary for failures in the root layout itself. It replaces the whole document,
 * so it brings its own <html>/<body> and stays dependency-free (no shell, fonts or toasts).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <html lang="en">
      <body className="min-h-dvh bg-paper text-ink">
        <main className="mx-auto max-w-[46ch] px-4 py-16">
          <h1 className="text-heading font-bold">BillSplit didn&apos;t load</h1>
          <p className="mt-2 text-body-sm text-ink-muted">
            Something went wrong on our side. Your saved expenses and payments are safe. Try again, and if it keeps happening, come
            back in a few minutes.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-11 items-center rounded-[10px] bg-ink px-4 font-semibold text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Try again
            </button>
            {/* A full page load, since the client router may be what broke. */}
            <a
              href="/home"
              className="inline-flex h-11 items-center rounded-[10px] border border-field px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Go to home
            </a>
          </div>
          {digest ? (
            <p className="mt-6 text-meta text-ink-muted">
              Error reference: <span className="num">{digest}</span>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  );
}
