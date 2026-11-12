/**
 * Session cookie (no max-age) set when someone hides the verify-email banner; it lasts until the
 * browser is closed. Holds the user id so a different account on the same browser still sees it.
 * Plain module (not "use client") so the app layout can read the name on the server.
 */
export const VERIFY_BANNER_COOKIE = "bs_verify_banner_dismissed";
