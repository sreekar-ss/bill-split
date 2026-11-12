import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { TEST_SESSION_SECRET, testDatabaseUrl } from "./scripts/test-env.mjs";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;
/** The test server "sends" email by appending JSON lines here; specs read reset links from it. */
export const MAIL_OUTBOX = resolve("reports/e2e-mail-outbox.jsonl");

/**
 * E2E runs against a production build (`next build` must have run) served by `next start`,
 * using the local `billsplit_test` database (reset in global setup).
 */
export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "reports/e2e-artifacts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: [["list"], ["html", { outputFolder: "reports/e2e-html", open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 860 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl(),
      SESSION_SECRET: TEST_SESSION_SECRET,
      BCRYPT_ROUNDS: "4",
      INSECURE_COOKIES: "1",
      APP_URL: baseURL,
      MAIL_TRANSPORT: "file",
      MAIL_OUTBOX,
      // No 60s wait between two emails to the same person, so "Resend link" flows can be tested.
      EMAIL_COOLDOWN_SECONDS: "0",
    },
  },
});
