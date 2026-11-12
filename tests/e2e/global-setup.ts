import { prepareTestDb } from "../../scripts/prepare-test-db.mjs";

export default async function globalSetup() {
  await prepareTestDb({ reset: true });
}
