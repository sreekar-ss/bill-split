import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { BalanceBeam, type BeamRow } from "@/components/ui/balance-beam";
import { Button } from "@/components/ui/button";
import { DateBlock, LedgerRow, StakeLabel } from "@/components/ui/ledger";
import { Panel } from "@/components/ui/page";
import { formatMoney } from "@/lib/domain/money";

// A worked example, in cents. Members' nets sum to zero; the plan clears them in three payments.
const BEAM: BeamRow[] = [
  { id: "you", name: "You", cents: 28910, phrase: { positive: "get back", negative: "owe" } },
  { id: "ben", name: "Ben", cents: 11130 },
  { id: "dev", name: "Dev", cents: -17230 },
  { id: "chloe", name: "Chloe", cents: -22810 },
];

const PLAN = [
  { from: "Chloe", to: "you", cents: 22810 },
  { from: "Dev", to: "Ben", cents: 11130 },
  { from: "Dev", to: "you", cents: 6100 },
];

const LEDGER = [
  { date: "2026-11-02", title: "Airport taxi", meta: "Chloe paid $38.00", stake: -950 },
  { date: "2026-11-01", title: "Fado night tickets", meta: "Ben paid $180.00", stake: -4500 },
  { date: "2026-10-28", title: "Airbnb in Alfama", meta: "You paid $640.00", stake: 48000 },
];

const STEPS = [
  {
    title: "Log it at the till",
    body: "Amount, who paid, who's in. It takes about as long as reading the receipt, and anyone in the group can be the payer.",
  },
  {
    title: "Split it your way",
    body: "Equally, by exact amounts, by percentages or by shares. Odd cents are handed out fairly, so every split adds back up to the total.",
  },
  {
    title: "Settle in as few payments as possible",
    body: "BillSplit works out the shortest list of who pays whom. Record a payment, partial or full, and the balances move.",
  },
];

function Wordmark() {
  return (
    <Link href="/" className="-mx-2 inline-flex h-11 items-center rounded-[10px] px-2 text-title font-bold tracking-tight">
      BillSplit
    </Link>
  );
}

function ExampleGroup() {
  return (
    <figure className="m-0">
      <Panel className="p-4 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-title font-bold">Lisbon trip</p>
            <p className="mt-0.5 text-meta text-ink-muted">Ana, Ben, Chloe and Dev</p>
          </div>
          <p className="shrink-0 text-meta text-ink-muted">
            <span className="num font-semibold text-ink">$1,117.40</span> spent
          </p>
        </div>

        <h2 className="mt-6 text-body-sm font-semibold text-ink-muted">Balances</h2>
        <BalanceBeam rows={BEAM} label="Example balances" className="mt-3" />

        <h2 className="mt-7 text-body-sm font-semibold text-ink-muted">Settle up</h2>
        <p className="mt-1 text-meta text-ink-muted">3 payments settle everyone.</p>
        <ul className="mt-2 border-t border-rule">
          {PLAN.map((p) => (
            <li key={`${p.from}-${p.to}`} className="flex items-baseline justify-between gap-3 border-b border-rule py-2.5">
              <span className="font-medium">
                {p.from} pays {p.to}
              </span>
              <span className={p.to === "you" ? "num font-bold text-owed" : "num font-bold"}>{formatMoney(p.cents)}</span>
            </li>
          ))}
        </ul>

        <h2 className="mt-7 text-body-sm font-semibold text-ink-muted">Recent expenses</h2>
        <div className="mt-1">
          {LEDGER.map((e) => (
            <LedgerRow
              key={e.title}
              leading={<DateBlock date={e.date} />}
              title={e.title}
              meta={e.meta}
              trailing={<StakeLabel cents={e.stake} />}
              className="last:border-b-0"
            />
          ))}
        </div>
      </Panel>
      <figcaption className="mt-3 px-1 text-meta text-ink-muted">
        An example group, seen by Ana. Everyone&apos;s balances add up to zero.
      </figcaption>
    </figure>
  );
}

type Props = { searchParams: Promise<{ deleted?: string | string[] }> };

/** Shown once after "Delete account" lands here (/?deleted=1). */
function DeletedNotice() {
  return (
    <div
      role="status"
      className="mx-auto mt-4 flex max-w-[1040px] items-start gap-3 rounded-[10px] border border-rule bg-surface px-3.5 py-3"
    >
      <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-ink-muted" aria-hidden />
      <p className="text-body-sm">
        <span className="font-semibold">Your account was deleted.</span>{" "}
        <span className="text-ink-muted">Thanks for using BillSplit. Your name now shows as &ldquo;Deleted user&rdquo; in other people&apos;s history.</span>
      </p>
    </div>
  );
}

export default async function LandingPage({ searchParams }: Props) {
  const { deleted } = await searchParams;
  return (
    <div className="min-h-dvh px-4 md:px-6">
      <header className="mx-auto flex max-w-[1040px] items-center justify-between gap-3 pt-4 md:pt-6">
        <Wordmark />
        <Button asChild variant="ghost">
          <Link href="/login">Log in</Link>
        </Button>
      </header>

      <main id="main" className="mx-auto max-w-[1040px]">
        {deleted === "1" ? <DeletedNotice /> : null}
        <section
          aria-labelledby="hero-heading"
          className="grid items-start gap-10 pb-14 pt-10 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-16 lg:pt-24"
        >
          <div className="lg:pt-6">
            <h1 id="hero-heading" className="max-w-[16ch] text-hero font-bold leading-[1.08] tracking-[-0.02em] md:text-[3.25rem]">
              Know who owes whom, down to the cent.
            </h1>
            <p className="mt-5 max-w-[44ch] text-[1.0625rem] text-ink-muted">
              BillSplit keeps a shared ledger for the flat, the trip or the dinner. Log what you paid in a few seconds, and when it&apos;s
              time to settle, it tells you exactly who pays whom.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg">
                <Link href="/register">Create an account</Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <Link href="/login">Log in</Link>
              </Button>
            </div>
            <p className="mt-4 text-meta text-ink-muted">Email and password only. Add friends by the email they signed up with.</p>
          </div>
          <ExampleGroup />
        </section>

        <section aria-labelledby="how-heading" className="border-t border-rule py-12">
          <h2 id="how-heading" className="text-title font-bold">
            How it works
          </h2>
          <ol className="mt-6 grid gap-x-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 border-t border-rule py-5 md:block md:border-t-2 md:border-ink md:pt-4">
                <span aria-hidden className="num shrink-0 text-title font-bold text-ink-muted md:block">{i + 1}</span>
                <span>
                  <span className="block font-semibold md:mt-2">{s.title}</span>
                  <span className="mt-1 block text-body-sm text-ink-muted">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1040px] flex-wrap items-center justify-between gap-3 border-t border-rule py-6 text-meta text-ink-muted">
        <span className="font-semibold text-ink">BillSplit</span>
        <span className="flex gap-5">
          <Link href="/login" className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">
            Log in
          </Link>
          <Link href="/register" className="inline-flex min-h-11 items-center font-semibold text-ink underline underline-offset-4">
            Create an account
          </Link>
        </span>
      </footer>
    </div>
  );
}
