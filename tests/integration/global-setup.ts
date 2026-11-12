import { prepareTestDb } from "../../scripts/prepare-test-db.mjs";

export default async function setup() {
  await prepareTestDb({ reset: true });
}
