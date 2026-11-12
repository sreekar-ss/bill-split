import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/token";

/**
 * Clears a stale/invalid session cookie and goes to /login. Used by requireUser().
 * A session that still works is left alone: this is a GET, so any other site could trigger it.
 * Logging out on purpose goes through the POST Server Action (logoutAction) instead.
 */
export async function GET(request: NextRequest) {
  if (await getCurrentUser()) return NextResponse.redirect(new URL("/home", request.url));
  const res = NextResponse.redirect(new URL("/login", request.url));
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
