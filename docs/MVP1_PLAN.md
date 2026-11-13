# BillSplit — MVP1 plan

## Goal
A shared-expense app where a person can log what they paid, split it with a group or a friend, see who owes whom, and record payments to settle up. It should work on a phone first and be correct to the cent.

## Why a re-architecture
The v0.2 codebase had problems that features couldn't be layered on:
- The payer was always the creator, so "Ben paid for dinner" couldn't be recorded by Ana.
- Money was stored as `Float`. Equal splits of $10 / 3 didn't add back up to the total.
- Settling up flipped `settled` flags on splits and looked users up **by display name**. That conflicts with debt simplification, because a simplified A→C payment produced an "amount mismatch".
- The itemized split wrote an `amount` column, but the schema's column is `price`.
- The JWT lived in `localStorage`, there was no route protection, and `JWT_SECRET` fell back to a hard-coded string.
- There were no tests.

## Architecture (new)
| Concern | Choice |
|---|---|
| Framework | Next.js 16 App Router: Server Components for reads, Server Actions for mutations |
| Auth | Email + password (bcrypt); session = signed JWT (`jose`) in an httpOnly cookie; `proxy.ts` guards app routes; secret required (no fallback) |
| Data | PostgreSQL + Prisma 7 (`prisma-client` generator, `@prisma/adapter-pg`, `prisma.config.ts`) |
| Money | Integer cents everywhere (`amountCents`) |
| Ledger | Balances are **derived**: expense payer +amount, each share −share, payments shift balances. Nothing is "flagged settled". |
| UI | Tailwind CSS 4 + shadcn/ui primitives (Radix) + lucide icons + sonner toasts. Design tokens in `DESIGN.md`. |
| Validation | zod 4 schemas (`lib/validation.ts`), parsed inside the `lib/server` services, so every caller is validated |
| Tests | Vitest unit (domain math), Vitest integration (services against a real local Postgres), Playwright E2E (critical flows, mobile + desktop) |
| Pipeline | `npm run pipeline` runs every gate in order: env-safety → generate → typecheck → lint → unit → integration → build → e2e |

Layering:
```
app/(routes)           Server Components (read via services) + client islands
app/actions/*.ts       Server Actions: authed() → service → revalidate (authed() in app/actions/run.ts)
lib/domain/*           Pure TS: money, splits, ledger, simplify (no I/O, unit-tested)
lib/server/*           Services: zod parsing + authorization + prisma queries (integration-tested)
lib/auth/*             session cookie, password hashing, getCurrentUser
```

## MVP1 scope
1. **Accounts**: register, log in, log out, edit name / default currency, change password, **forgot password** (an emailed single-use link that expires in 30 minutes; it doesn't reveal which emails have accounts, and a reset signs out other sessions).
2. **Groups**: create, rename, add a member by email (they must have an account), remove a member (only when their balance is zero), leave a group.
3. **Friends**: add by email (auto-accepted). The friend list shows the net balance with each friend across all groups and direct expenses.
4. **Expenses** (in a group or directly with a friend): description, amount, **payer (any participant)**, date, category, notes. Split methods: **equal / exact amounts / percentages / shares**, with cent-accurate remainder distribution. Edit and delete.
5. **Balances**: per group (each member's net) and the **simplified "who pays whom" plan**. On the dashboard: total you owe, total you're owed, and a per-person net.
6. **Settle up**: record a payment between two people in a group or between friends. The amount is prefilled from the suggestion and partial payments are allowed. A payment can be deleted.
7. **Activity**: a recent feed of expenses and payments across everything the user can see.
8. **Quality floor**: mobile bottom nav and desktop rail, light and dark themes, empty states, loading feedback, toasts, keyboard focus, and WCAG AA contrast.

### Email configuration
Password-reset emails go through [Resend](https://resend.com). Settings:
- `RESEND_API_KEY` turns sending on.
- `EMAIL_FROM` sets the sender, e.g. `BillSplit <noreply@yourdomain>`. Without a verified domain, Resend only delivers to your own account address, sent from `onboarding@resend.dev`.
- `APP_URL` is the public origin used in emailed links. On Vercel it falls back to the branch or production URL.

Without a key:
- **Local dev:** emails are printed to the server log.
- **Tests:** emails go to memory or a file.
- **Production:** the form explains that email isn't set up.

### Deferred (post-MVP1)
Receipts/OCR, itemized splits, multi-currency conversion, recurring expenses, notifications/email, invites for people without accounts, comments, payments integration, PWA/offline.

## Data migration
A new Prisma migration converts the existing data in place:
- `Expense.amount` (Float) becomes `amountCents` (Int).
- `paidById` is backfilled from `createdById`.
- `ExpenseSplit.amount` becomes `amountCents` (Int).
- `Settlement.amount` becomes `amountCents` (Int).

Legacy columns that MVP1 doesn't use (`settled`, `paidAmount`, …) are left alone. The existing settlements stay valid under the derived ledger. The production (Neon) database was migrated on release, 2026-11-12. Migrations now run on a deploy only when `MIGRATE_ON_BUILD=1` is set (see `scripts/vercel-build.mjs`).

## Orchestration
Development is driven by a multi-agent workflow in phases:
1. **Foundation** (lead): dependencies, schema + migration, domain math with tests, auth, services + actions, design tokens, app shell, pipeline script.
2. **Design**: screen mockups from `DESIGN.md`.
3. **Build**: parallel feature agents with disjoint file ownership (groups, expenses, friends + settle, dashboard/activity/account). Each must leave typecheck and unit tests green.
4. **Test**: E2E agent writes Playwright specs for every MVP1 flow and fixes the bugs they find.
5. **Review**: independent reviewers for code correctness/security, design critique, and accessibility, working from screenshots. Their findings go to fixers.
6. **Gate**: `npm run pipeline` must pass end-to-end.
