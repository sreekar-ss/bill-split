import "server-only";

/**
 * The public origin used in links we email (e.g. password reset). Never derived from the
 * request's Host header, so an attacker can't make us email a link to their own domain.
 */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;
  const env = process.env.VERCEL_ENV;
  if (env === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env === "preview" && process.env.VERCEL_BRANCH_URL) return `https://${process.env.VERCEL_BRANCH_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV !== "production") return `http://localhost:${process.env.PORT ?? 3000}`;
  throw new Error("APP_URL must be set in production");
}
