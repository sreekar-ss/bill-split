import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/token";

/**
 * Optimistic route guard: checks the session cookie's signature only (no DB). Pages and
 * actions still call requireUser(), which also validates the user's sessionVersion.
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
  if (session && (AUTH_PAGES.includes(pathname) || pathname === "/")) {
    return NextResponse.redirect(new URL("/home", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|ico|webmanifest)$).*)"],
};
