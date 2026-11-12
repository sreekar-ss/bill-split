/** Mirrors the server's check in app/actions/auth.ts: only same-site relative paths survive. */
export function safeNextParam(value: string | string[] | undefined): string | undefined {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return undefined;
  return next;
}

/** Builds a link to the other auth page that keeps the ?next= destination. */
export function withNext(path: string, next: string | undefined) {
  return next ? `${path}?next=${encodeURIComponent(next)}` : path;
}
