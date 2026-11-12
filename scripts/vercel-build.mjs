#!/usr/bin/env node
/**
 * Vercel build entrypoint. Database migrations run ONLY when MIGRATE_ON_BUILD=1 is set for the
 * deploying environment (e.g. Preview, which uses its own Neon branch). Production migrations are a
 * deliberate release step — set MIGRATE_ON_BUILD=1 for Production only when releasing a schema change.
 */
import { execSync } from "node:child_process";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

run("npx prisma generate");
if (process.env.MIGRATE_ON_BUILD === "1") {
  console.log(`[vercel-build] MIGRATE_ON_BUILD=1 → applying migrations (${process.env.VERCEL_ENV ?? "unknown env"})`);
  // Neon: migrate over the direct (non-pooled) connection; the app keeps the pooled DATABASE_URL.
  const direct = process.env.DATABASE_URL_UNPOOLED;
  run("npx prisma migrate deploy", direct ? { DATABASE_URL: direct } : {});
} else {
  console.log("[vercel-build] skipping migrations (MIGRATE_ON_BUILD is not 1)");
}
run("npx next build");
