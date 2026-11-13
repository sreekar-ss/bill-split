import { testDatabaseUrl, TEST_SESSION_SECRET } from "../../scripts/test-env.mjs";

process.env.DATABASE_URL = testDatabaseUrl();
process.env.SESSION_SECRET = TEST_SESSION_SECRET;
process.env.BCRYPT_ROUNDS = "4";
process.env.MAIL_TRANSPORT = "memory";
process.env.APP_URL = "https://app.example.test";
process.env.PUSH_TRANSPORT = "memory";
