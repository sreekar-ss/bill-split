import { testDatabaseUrl, TEST_SESSION_SECRET } from "../../scripts/test-env.mjs";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET = TEST_SESSION_SECRET;
process.env.BCRYPT_ROUNDS = "4";
