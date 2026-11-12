// Resolves the database URL used by tests/E2E: the local dev DB from `.env`, with the
// database name swapped to `billsplit_test`. Refuses to run against anything but localhost.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

export function testDatabaseUrl() {
  const fromEnv = process.env.TEST_DATABASE_URL;
  const base = fromEnv ?? parse(readFileSync(resolve(process.cwd(), ".env"))).DATABASE_URL;
  if (!base) throw new Error("No DATABASE_URL in .env and no TEST_DATABASE_URL set");
  const url = new URL(base);
  if (!["localhost", "127.0.0.1"].includes(url.hostname)) {
    throw new Error(`Refusing to run tests against non-local database host "${url.hostname}"`);
  }
  if (!fromEnv) url.pathname = "/billsplit_test";
  return url.toString();
}

export const TEST_SESSION_SECRET = "test-session-secret-not-for-production-use-0123456789";
