import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sessionCookieOptions, shouldRefreshSession, signSessionToken, verifySessionToken } from "@/lib/auth/token";

/**
 * Optimistic route guard: checks the session cookie's signature only (no DB). Pages and
 * actions still call requireUser(), which also validates the user's sessionVersion.
 *
 * Rolling sessions: a valid session over a day old is re-signed (same user and version) with a
 * fresh 30-day expiry, so people who use the app at least monthly stay logged in — up to 180 days
 * after they actually signed in (then they sign in again). A stale version stays stale —
 * logout-everywhere and password changes still end it.
 */
const APP_PREFIXES = ["/home", "/groups", "/friends", "/activity", "/account", "/expenses"];
const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session && APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  const response =
    session && (AUTH_PAGES.includes(pathname) || pathname === "/")
      ? NextResponse.redirect(new URL("/home", request.url))
      : NextResponse.next();
  if (session && shouldRefreshSession(session)) {
    response.cookies.set(SESSION_COOKIE, await signSessionToken({ userId: session.userId, v: session.v, authTime: session.authTime }), sessionCookieOptions());
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|webmanifest|js|txt)$).*)"],
};
