# BillSplit — v2 plan

MVP1 (live since 2026-11-12) lets people split costs with others who already have accounts and see who owes whom. v2 has two jobs: **bring people in** and **get people paid back**. Receipt scanning is the headline feature, but it ships **last**, as Milestone D, so everything else lands first.

## Milestone A — bring people in, safely
| Feature | Scope |
|---|---|
| Email verification | Signing up sends a verification link. Unverified accounts see a banner and can resend the link. A verified email is required to claim an invited placeholder (below). |
| Invite links | Each group gets a shareable join link (copy or share sheet) that admins can reset. Opening it shows a "Join Lisbon trip" page: log in or sign up, then join. |
| Invite by email, with placeholders | Adding an email that has no account creates a **placeholder member** ("Ben (invited)") and emails them an invite. Placeholders can pay for and share expenses straight away. When that person signs up and verifies the same email, they inherit the placeholder's history and balances. |
| Payment links on settle-up | Each user can save a Venmo, PayPal.me, Cash App or UPI handle. "Settle up" shows "Pay Ben $42 with Venmo / …" as deep links with the amount and note filled in, then "Record payment". No money is handled by BillSplit. |
| Login protection | Login is throttled per email and per IP, with a temporary lockout and plain-language messages. Implemented as a Postgres-backed rate limiter. |
| Log out everywhere | An Account action that signs out every device. |
| Delete account and export data | Export downloads all your data as JSON. Delete is blocked while any balance is unsettled. When it goes through, the account is anonymised to "Deleted user", so other people's ledgers still add up. |
| Real 404s | Pages for groups, friends and expenses you can't access return HTTP 404, not 200. |

## Milestone B — keep people coming back
| Feature | Scope |
|---|---|
| Email notifications | "Ana added Dinner, you owe $30", "Ben recorded a $42 payment to you", and invites. Each type can be turned on or off on a notification settings page, and every email has a one-click unsubscribe link. Emails are sent after the response, so the app never waits on the mail server. |
| Reminders | A "Remind Ben" button on settle-up rows emails a polite nudge. It has a cooldown of 1 per pair per 3 days. |
| Weekly digest | Optional and off by default. A Monday summary of your balances. It's skipped when you're all settled up. |
| Recurring expenses | Any expense can repeat weekly or monthly, with an end date or none. A daily Vercel Cron job creates the due expenses idempotently. Recurring expenses can be paused or stopped, and they're labelled on the ledger. |

## Install as an app (shipped with Milestone B)
- **Installable:** web app manifest, standalone display, iPhone home-screen settings, and the "Your slice" icon (docs/design/app-icon.svg). PNG and maskable icons are generated from one SVG.
- **Install prompt:**
  - iPhone: step-by-step Share → Add to Home Screen. iOS has no install API.
  - Android Chrome: a real Install button.
  - In-app browsers: "open in Safari" instead.
  - It only opens by itself on phones, for users with a group or friend, once per session. "Not now" hides it for 30 days. It's always available from Account → Install the app.

## Notification channels and email budget (2026-11-13)
Resend's free plan allows 3,000 emails a month and 100 a day, so email is kept for when it's needed:

| Event | Push | Email |
|---|---|---|
| Expense added, payment recorded, recurring expense created | ✓ | — |
| Weekly summary (opt-in) | ✓ | — |
| Reminder | ✓ | only if the person has no push device |
| Confirm email, password reset, invite to someone without an account | — | ✓ (always) |

- Optional emails (reminder fallbacks) are skipped once the day's count reaches `EMAIL_OPTIONAL_DAILY_CAP` (default 80). Required emails always send.
- "Turn on notifications?" prompt: appears ~6s after opening the app when push is supported and permission hasn't been decided. Once per session, never in the same session as the install prompt, and "Not now" hides it for 14 days.
- "Send a test notification" reports whether the push reached the browser, which separates "the OS is hiding notifications" from "it never arrived".

## Milestone C — travel-ready (ON HOLD — the owner will ask when it's needed)
| Feature | Scope |
|---|---|
| Expenses in any currency | Enter an expense in any supported currency. In a group, it's converted to the group's currency at the expense date's European Central Bank rate (Frankfurter API, cached in the database). The original amount and the rate are shown on the expense. Direct expenses can pick their own currency. |

## Platform work (runs alongside the milestones)
- **CI:** a GitHub Actions workflow runs the full `npm run pipeline` (with a Postgres service and Playwright) on every pull request and every push to `main`.
- **Isolated preview database:** a long-lived Neon `preview` branch. Preview deploys never use the production database.
- **Verified sending domain:** a verified Resend domain plus `EMAIL_FROM`. **This blocks real-world email delivery for invites and notifications.** It's an owner action, needing a domain and DNS records.
- **Error monitoring:** optional Sentry, behind an environment flag, if an account is provided.

## Milestone D — receipt scanning (last)
A self-hosted, open-weight agent service behind a fixed HTTP contract, run as asynchronous jobs. The flow:
1. Preprocess the image.
2. A vision-language model extracts the receipt, with its output forced into a strict JSON format.
3. The arithmetic is checked, and flagged lines are re-read up to a bounded limit.

The person always reviews the result, and the itemized split shares tax, tip and discounts proportionally. The model is chosen by testing candidates on a set of 30–50 real receipts. The service runs on the owner's Mac first, then on Modal. Details are in the conversation notes. It still needs the owner's hardware and a language choice.

## Not in v2
In-app payments, real-time live updates, native mobile apps, gamification. The v2.1 candidates are insights/charts, search plus CSV export, comments, a PWA with offline entry, and group archive/emoji.

## Process
For each milestone, the work runs in this order:
1. **Foundation** (lead): schema, migration, services and domain logic, with unit and integration tests.
2. **Build:** parallel UI agents, each owning separate files.
3. **Integrate & test:** integration and E2E testing.
4. **Review:** independent code, design and accessibility reviews.
5. **Fix:** the fixer works until `npm run pipeline` is green.
6. **Preview:** the milestone ships to a preview for the owner to review, then goes to production.
