import "server-only";
import { headers } from "next/headers";
import type { RequestMeta } from "./users";

/** Caller IP for throttling. On Vercel, x-forwarded-for's first entry is set by the platform. */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip };
}
