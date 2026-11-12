# BillSplit design system

**Subject.** Money shared between friends, roommates and travel companions.
**Audience.** People in their 20s–30s, mostly on a phone, often standing at a till or in a group chat.
**Primary job.** Answer "who owes whom, and how much?" at a glance, and log an expense in under 15 seconds.

**Direction: cheque & ledger.** The visual language comes from cheque books and ledgers: a cool, faintly green security-paper ground, deep ink-blue type, figures set in neat tabular columns, and ruled lists instead of piles of cards. Money that is owed *to you* is printed in banknote green and money *you owe* in crimson ink. One highlighter-yellow mark is reserved for the single most important action: adding an expense.

Rejected defaults (and why):
- **Cream + terracotta.** It reads as generic, and terracotta is too close to "debt red", which would confuse the meaning.
- **Black + neon.** Feels like a crypto app. Shared bills should feel calm and trustworthy.
- **A card for every item.** Expenses and members are *rows in a ledger*, so they become divided lists. Only the summary and the sheets get surfaces.

## Color tokens
Defined as CSS variables in `app/globals.css` and exposed to Tailwind via `@theme inline`.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#F2F5F1` | `#0E1524` | App background (security-paper tint / night ink) |
| `--surface` | `#FFFFFF` | `#16203A` | Sheets, dialogs, summary panel, inputs |
| `--ink` | `#13213F` | `#E6ECF5` | Primary text, primary buttons |
| `--ink-muted` | `#55627A` | `#9AA7BD` | Secondary text, meta |
| `--rule` | `#D3DCD4` | `#26314D` | Dividers, input borders |
| `--owed` | `#0B7A5C` | `#3CC79B` | Positive balance ("you are owed", "gets back") |
| `--owe` | `#B3243F` | `#FF7A93` | Negative balance ("you owe") |
| `--highlight` | `#F4D94A` | `#F4D94A` | Add-expense button only |
| `--highlight-ink` | `#13213F` | `#13213F` | Text on `--highlight` (fixed in both themes; dark `--ink` is unreadable on yellow) |
| `--field` | `#7F8C9F` | `#66779A` | Input, checkbox and secondary-button outlines (≥3:1 non-text contrast; `--rule` is too faint for controls) |
| `--focus` | `#2F6FEB` | `#7AA5FF` | Focus rings |

Rules:
- Settled or zero balances use `--ink-muted` and the words "settled up". Never use green for zero.
- Don't rely on color alone. A balance always carries words ("owes you", "you owe") as well as its color.
- Every text/background pair meets WCAG AA (4.5:1 for body text).

## Typography
- **Family:** Hanken Grotesk (via `next/font/google`, variable). It's one family throughout, and personality comes from weight and size.
- **Figures:** every money amount uses `font-variant-numeric: tabular-nums` (utility class `.num`). Large balances use weight 700 with negative tracking (`-0.02em`).
- **Scale (rem):** 0.8125 meta / 0.9375 body-sm / 1 body / 1.25 title / 1.625 page heading / 2.5 hero figure. Line-height is 1.5 for body and 1.15 for headings.
- Sentence case everywhere. No ALL-CAPS eyebrow labels, no middle-dot meta strings. Meta lines are short phrases, e.g. "Ana paid $42.00", with the date in its own column.

## Shape, space, elevation
- **Radius hierarchy:** controls (buttons, inputs, chips) 10px; sheets and dialogs 20px; avatars fully round; list rows square (they sit on rules).
- **Spacing:** 4px base. The page gutter is 16px on mobile and 24px on desktop. The content column is max 720px. On wide screens the group page adds a 320px side column for balances.
- **Elevation:** only sheets, dialogs and the floating add button have a shadow (`0 8px 24px rgb(19 33 63 / 0.14)`). Everything else is flat, with rules.

## Mockups
`docs/design/screens.html` contains reference screens for every MVP1 page, in light and dark, with component measurements at the bottom. When the mockups and this file disagree, this file wins.

## Signature element: the balance beam
A diverging horizontal bar centred on zero, one row per person. Bars extend right in `--owed` for people who get money back and left in `--owe` for people who owe. The longest bar is scaled to the full half-width. Each row reads e.g. "Ben, gets back $30.00" with the amount right-aligned in tabular figures. It's used on the group page (members' nets) and the dashboard (your net with each person). It is the only "chart" in the app, so don't add other decorative graphics.

## Layout & navigation
```
Mobile (<768px)                         Desktop (≥1024px)
┌──────────────────────────┐            ┌──────┬────────────────────────┬──────────┐
│ Title            [avatar]│            │ Rail │ Page heading   [+ Add] │ Balances │
│ ┌──────────────────────┐ │            │ Home │ ───────────────────────│ beam     │
│ │ summary panel        │ │            │Groups│ ledger rows            │ settle   │
│ └──────────────────────┘ │            │Frnds │ ledger rows            │ plan     │
│ ledger row ───────────── │            │Activ.│                        │          │
│ ledger row ───────────── │            │Acct  │                        │          │
│                [+ Add]   │            └──────┴────────────────────────┴──────────┘
│ Home Groups Friends Act Me│ ← bottom tab bar (icons + labels)
└──────────────────────────┘
```
- Content is left-aligned. Amounts are right-aligned in their own column.
- **Add expense:** on mobile it's a floating highlighter-yellow pill above the tab bar ("Add expense"). It's fully rounded, unlike the 10px controls, which marks it as the primary action. On desktop it's a highlighter button in the rail/header. It's the only yellow thing on screen. It's hidden when there is no group or friend to split with.
- **Group page on mobile:** no summary panel. The balance beam and the settle-up plan come first, then the ledger.
- **Sheets:** forms (add expense, settle up, add member) open as a bottom sheet on mobile and a centred dialog on desktop.

## Components
- **Ledger row:** a 44px+ tap target, made up of a leading date block (month abbreviation over the day number) or avatar, then title + meta, then a right-aligned amount column. The amount column shows the user's own stake ("you lent $20.00" in owed green / "you borrowed $12.50" in owe crimson / "not involved" muted). Rows are separated by `--rule`.
- **Payment rows** (in ledgers and activity): a muted "payment" label with the amount in plain `--ink`. Payments don't use green or crimson.
- **Summary panel:** a surface with two figures side by side, "You're owed" and "You owe", plus the net in the hero size.
- **Buttons:** primary = `--ink` background with `--surface` text. Secondary = outlined with `--rule`. Destructive = `--owe` text with a confirmation step. The add button = `--highlight`. Labels say exactly what happens: "Save expense", "Record payment", "Add member".
- **Split editor:** segmented control (Equally / Exact / Percent / Shares). Each participant row has a checkbox, a name and an input, with a live per-person amount. A footer line shows what's left to assign ("$3.20 left to assign" in owe crimson, "All assigned" in muted with a check). The save button stays disabled until the split balances.
- **Empty states:** one sentence on what this place is for, plus the action that fills it, e.g. "No expenses yet. Add the first one and we'll keep the tally." with an [Add expense] button.
- **Toasts** (sonner) match the action name: "Expense saved", "Payment recorded", "Member added".

## Which number "per person" means
Inside a group, debts are simplified into a settle-up plan. The amount between you and a person (on Home and on the friend page) is the **sum of what the plan in each shared group says** plus your direct (non-group) balance with them. This way Home always agrees with what "Settle up" asks you to pay. The friend page shows the per-group breakdown so the total is explainable.

## Motion
- Sheets slide up (200ms, ease-out). The balance beam bars grow from the centre once, on first render (300ms).
- Nothing else animates on its own. Respect `prefers-reduced-motion` (no transitions).

## Copy voice
Plain, friendly, specific. "You owe Ben $12.50", not "Outstanding liability". Errors explain how to fix things: "That email doesn't have a BillSplit account yet. Ask them to sign up, then add them again."
