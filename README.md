# BillSplit

BillSplit is a bill-splitting progressive web app: add shared expenses in groups or directly with a friend, see who owes whom, and settle up with
payment links. It installs on phones as an app, sends push notifications, and keeps working offline for new expenses. It's live at
https://billsplit.thevector.dev.

## Stack
- Next.js 16 (App Router, Server Components for reads, Server Actions for mutations) and React 19
- PostgreSQL with Prisma 7 (`@prisma/adapter-pg`, client generated into `lib/generated/prisma`)
- Tailwind CSS 4, Radix primitives, lucide icons, sonner toasts
- zod 4 for validation, `jose` session cookies, `bcryptjs` password hashing
- Web Push (`web-push`) for notifications, Resend for the few emails that are required
- Vitest (unit and integration) and Playwright (end-to-end, desktop and mobile)

Code layout: `app/` holds routes and Server Actions (`app/actions/*`, each `authed()` → service → revalidate), `lib/domain/` is pure, unit-tested
logic (money, splits, ledger, recurrence), `lib/server/` holds the services (zod parsing, authorization, Prisma queries), and `components/` the UI.

## Prerequisites
- **Node 24** via nvm (`.nvmrc` says 24). Older Node versions break Prisma 7 and Vitest 5: run `nvm use` in this folder before anything else.
- **Docker Postgres** for the local and test databases, for example
  `docker run --name billsplit-db -e POSTGRES_USER=billsplit -e POSTGRES_PASSWORD=billsplit -e POSTGRES_DB=billsplit -p 5433:5432 -d postgres:16`.
  Point `DATABASE_URL` in `.env` (and `.env.development.local`, which `next dev` reads first) at it. Tests use a `billsplit_test` database on the
  same server, and `scripts/test-env.mjs` refuses to run them against anything that isn't localhost.

> **Warning: `.env.local` holds production credentials (the production database). Never use it for local development or tests, and never run
> migrations, tests or scripts with it loaded.** Next.js loads `.env.local` automatically, so keep a local `DATABASE_URL` in
> `.env.development.local` to override it for `next dev`.

## Commands
| Command | What it does |
|---|---|
| `npm install` | Installs dependencies and runs `prisma generate` |
| `npm run dev` | Starts the dev server on http://localhost:3000 |
| `npm run db:migrate` | Applies migrations (`prisma migrate deploy`) to the database in `DATABASE_URL`; local only |
| `npm run db:test:prepare` | Creates or resets the local `billsplit_test` database and applies migrations |
| `npm run typecheck` / `npm run lint` | `tsc --noEmit` / ESLint with zero warnings allowed |
| `npm run test:unit` / `npm run test:integration` | Vitest unit tests / integration tests against the local test database |
| `npm run test:e2e` | Builds the app and runs the Playwright specs |
| `npm run pipeline` | Runs every gate in order and stops at the first failure |

The pipeline gates are **env-safety → generate → typecheck → lint → unit → integration → build → e2e**. A summary is written to
`reports/pipeline.json`. Pick stages with `--only`, `--skip` or `--from`:

```sh
npm run pipeline -- --only=unit,integration
npm run pipeline -- --skip=e2e
npm run pipeline -- --from=build
```

CI (`.github/workflows/ci.yml`) runs the full pipeline with a Postgres service on every pull request and every push to `main`.

## Environment variables
Never commit values. Production and preview values live in Vercel.

| Name | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string (pooled on Vercel) |
| `DATABASE_URL_UNPOOLED` | Vercel only | Direct connection that `scripts/vercel-build.mjs` uses for migrations |
| `SESSION_SECRET` | Yes | Signs session cookies; a random string of at least 32 characters |
| `APP_URL` | Production | Public origin used in emailed and pushed links; falls back to the Vercel URL, or localhost in dev |
| `CRON_SECRET` | Production | Bearer secret that Vercel Cron sends to `/api/cron/daily` |
| `RESEND_API_KEY` | Production | Turns on email through Resend; without it, dev prints emails to the server log |
| `EMAIL_FROM` | Production | Sender address for emails (needs a verified Resend domain) |
| `EMAIL_OPTIONAL_DAILY_CAP` | No | Daily count after which optional emails (reminder fallbacks) are skipped; default 80 |
| `EMAIL_COOLDOWN_SECONDS` | No | Minimum gap between two emails of the same kind to one account; default 60 |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | For push | Web Push keys; created by `scripts/setup-vapid.mjs` |
| `VAPID_SUBJECT` | No | Contact URL sent to push services; has a built-in default |
| `LEGAL_CONTACT_EMAIL` | No | Contact address shown on the privacy and terms pages |
| `MIGRATE_ON_BUILD` | No | Set to `1` for a deploy that should run `prisma migrate deploy` |
| `BCRYPT_ROUNDS` | No | Password hashing cost; default 12 (tests use 4) |
| `INSECURE_COOKIES` | No | `1` drops the `Secure` cookie flag for production builds served over plain http (E2E only) |
| `PRISMA_LOG_QUERIES` | No | `1` logs every SQL query |
| `MAIL_TRANSPORT`, `MAIL_OUTBOX` | Tests | `memory` or `file` (with an outbox path) to capture emails instead of sending them |
| `PUSH_TRANSPORT`, `PUSH_OUTBOX` | Tests | `memory` or `file` (with an outbox path) to capture push notifications |
| `TEST_DATABASE_URL` | No | Overrides the test database URL (CI sets it); must be localhost |
| `E2E_PORT`, `E2E_REUSE_SERVER` | No | Playwright server port (default 3100) and whether to reuse a running server |
| `SCREENS` | No | `1` also runs the screenshot spec |
| `PORT` | No | Dev server port used to build local links; default 3000 |

`NODE_ENV`, `CI` and the `VERCEL_*` variables are set by the tooling and the platform.

## Deploying
- Vercel deploys through its git integration: pushes to `main` go to production, other branches get previews.
- The build runs `scripts/vercel-build.mjs` (`npm run vercel-build`). It always runs `prisma generate` and `next build`, and runs
  `prisma migrate deploy` only when `MIGRATE_ON_BUILD=1` is set for that environment. Set it deliberately for a release with a schema change,
  then remove it.
- `vercel.json` schedules a daily cron at 13:00 UTC on `/api/cron/daily`, authorized with `CRON_SECRET`. It creates due recurring expenses,
  sends weekly summaries on Mondays and clears expired records.
- `node scripts/setup-vapid.mjs` generates push keys for production and preview and stores them in Vercel without printing them. Changing the
  keys later means every device has to turn notifications on again.

## More docs
- [DESIGN.md](DESIGN.md): design tokens, layout, components, motion and copy voice
- [docs/MVP1_PLAN.md](docs/MVP1_PLAN.md): MVP1 architecture and scope
- [docs/V2_PLAN.md](docs/V2_PLAN.md): v2 milestones, notification channels and what's next
- [docs/design/](docs/design/): the app icon and screen mockups
