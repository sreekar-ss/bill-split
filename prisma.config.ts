import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma CLI reads DATABASE_URL from the process env or `.env` (local Docker DB).
// `.env.local` (production) is intentionally NOT loaded here.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
