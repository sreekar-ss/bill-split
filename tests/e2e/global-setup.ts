import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { prepareTestDb } from "../../scripts/prepare-test-db.mjs";

export default async function globalSetup() {
  await prepareTestDb({ reset: true });
  // Fresh mail outbox each run (see MAIL_OUTBOX in playwright.config.ts).
  const outbox = resolve("reports/e2e-mail-outbox.jsonl");
  mkdirSync(dirname(outbox), { recursive: true });
  writeFileSync(outbox, "");
  writeFileSync(resolve("reports/e2e-push-outbox.jsonl"), "");
}
