import type { Metadata } from "next";
import { cache } from "react";
import { categoryLabel } from "@/components/expenses/categories";
import { BackLink } from "@/components/insights/back-link";
import { insightsHref, parsePeriod, periodPhrase, PERIODS, type Period } from "@/components/insights/format";
import { LinkToggle } from "@/components/insights/link-toggle";
import { MonthChart } from "@/components/insights/month-chart";
import { PaidVsShare } from "@/components/insights/paid-vs-share";
import { RankedBars } from "@/components/insights/ranked-bars";
import { SpendSummary } from "@/components/insights/spend-summary";
import { EmptyState, PageHeader, Section } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { getGroupInsights } from "@/lib/server/insights";
import { orNotFound } from "@/lib/server/page";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ months?: string | string[] }>;
};

// One query per request, shared by generateMetadata and the page. A non-member gets a 404.
const load = cache(async (id: string, months: Period) => {
  const user = await requireUser();
  const insights = await orNotFound(getGroupInsights(user.id, id, { months }));
  return { user, insights };
});

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { insights } = await load(id, parsePeriod(sp.months));
  return { title: `Spending in ${insights.groupName}` };
}

export default async function GroupInsightsPage({ params, searchParams }: Props) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const months = parsePeriod(sp.months);
  const { user, insights } = await load(id, months);
  const path = `/groups/${id}/insights`;

  return (
    <div className="max-w-[720px]">
      <PageHeader
        back={<BackLink href={`/groups/${id}`}>{insights.groupName}</BackLink>}
        title="Group spending"
        subtitle="Everything the group spent, by month, category and person. Payments between people aren't counted."
      />

      <div className="mb-5">
        <LinkToggle
          label="Period"
          options={PERIODS.map((m) => ({
            href: insightsHref(path, { months: m }),
            label: `${m} months`,
            srLabel: `Last ${m} months`,
            current: m === months,
          }))}
        />
      </div>

      {insights.totalCents === 0 ? (
        <EmptyState
          title={`No expenses in ${periodPhrase(months)}`}
          body={
            months === 6
              ? "Once the group adds expenses, you'll see what it spent by month, category and person. Try the last 12 months for older spending."
              : "Once the group adds expenses, you'll see what it spent by month, category and person."
          }
        />
      ) : (
        <>
          <SpendSummary
            label={`Spent in ${periodPhrase(months)}`}
            totalCents={insights.totalCents}
            currency={insights.currency}
            monthly={insights.monthly}
          />

          <Section title="By month" className="mt-8">
            <MonthChart key={months} points={insights.monthly} currency={insights.currency} label="Group spending by month" />
          </Section>

          <Section title="By category">
            <RankedBars
              label="Group spending by category"
              currency={insights.currency}
              totalCents={insights.totalCents}
              rows={insights.byCategory.map((c) => ({ key: c.category, label: categoryLabel(c.category), cents: c.cents }))}
            />
          </Section>

          <Section title="Paid and share">
            <p className="mb-3 max-w-[60ch] text-body-sm text-ink-muted">
              Paid is what each person put down for expenses. Share is what their part of those expenses came to.
            </p>
            <PaidVsShare people={insights.byPerson} currency={insights.currency} meId={user.id} />
          </Section>
        </>
      )}
    </div>
  );
}
