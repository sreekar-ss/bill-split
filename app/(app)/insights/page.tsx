import { Users } from "lucide-react";
import type { Metadata } from "next";
import { AppLink } from "@/components/ui/app-link";
import { categoryLabel, currencyName } from "@/components/expenses/categories";
import { BackLink } from "@/components/insights/back-link";
import { insightsHref, parsePeriod, periodPhrase, first, PERIODS } from "@/components/insights/format";
import { LinkToggle } from "@/components/insights/link-toggle";
import { MonthChart } from "@/components/insights/month-chart";
import { RankedBars } from "@/components/insights/ranked-bars";
import { SpendSummary } from "@/components/insights/spend-summary";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Section } from "@/components/ui/page";
import { requireUser } from "@/lib/auth/session";
import { getPersonalInsights } from "@/lib/server/insights";

export const metadata: Metadata = { title: "Your spending" };

type Props = { searchParams: Promise<{ months?: string | string[]; currency?: string | string[] }> };

const GROUP_LIMIT = 6;

export default async function InsightsPage({ searchParams }: Props) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const months = parsePeriod(params.months);
  const insights = await getPersonalInsights(user.id, { months });

  const wanted = first(params.currency)?.toUpperCase();
  const current = insights.currencies.find((c) => c.currency === wanted) ?? insights.currencies[0];

  const period = (
    <LinkToggle
      label="Period"
      options={PERIODS.map((m) => ({
        href: insightsHref("/insights", { months: m, currency: current && insights.currencies.length > 1 ? current.currency : undefined }),
        label: `${m} months`,
        srLabel: `Last ${m} months`,
        current: m === months,
      }))}
    />
  );

  return (
    <div className="max-w-[720px]">
      <PageHeader
        back={<BackLink href="/home">Home</BackLink>}
        title="Your spending"
        subtitle="Your share of shared expenses, not what you paid for others. Payments between people aren't counted."
      />

      {/* One filter row above everything it scopes. */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {period}
        {insights.currencies.length > 1 && current ? (
          <LinkToggle
            label="Currency"
            options={insights.currencies.map((c) => ({
              href: insightsHref("/insights", { months, currency: c.currency }),
              label: c.currency,
              // The spoken name starts with the visible code (WCAG 2.5.3, label in name).
              srLabel: `${c.currency}, ${currencyName(c.currency)}`,
              current: c.currency === current.currency,
            }))}
          />
        ) : null}
      </div>

      {!current ? (
        <EmptyState
          title="Nothing to show yet"
          body={`Once you share an expense with someone, your share shows up here by month, category and group. There's nothing in ${periodPhrase(months)}.`}
          action={
            <Button asChild variant="secondary">
              <AppLink href="/groups">
                <Users aria-hidden />
                Go to your groups
              </AppLink>
            </Button>
          }
        />
      ) : (
        <>
          <SpendSummary
            label={`Your share in ${periodPhrase(months)}${insights.currencies.length > 1 ? ` (${current.currency})` : ""}`}
            totalCents={current.totalCents}
            currency={current.currency}
            monthly={current.monthly}
          />

          <Section title="By month" className="mt-8">
            <MonthChart key={`${current.currency}-${months}`} points={current.monthly} currency={current.currency} label="Your share by month" />
          </Section>

          <Section title="By category">
            <RankedBars
              label="Your share by category"
              currency={current.currency}
              totalCents={current.totalCents}
              rows={current.byCategory.map((c) => ({ key: c.category, label: categoryLabel(c.category), cents: c.cents }))}
            />
          </Section>

          <Section title="By group">
            <RankedBars
              label="Your share by group"
              currency={current.currency}
              totalCents={current.totalCents}
              limit={GROUP_LIMIT}
              otherLabel="Other groups"
              rows={current.byGroup.map((g) => ({
                key: g.id,
                // "direct" is everything split with friends outside a group.
                label: g.name,
                cents: g.cents,
                href: g.id === "direct" ? "/friends" : `/groups/${g.id}/insights`,
              }))}
            />
          </Section>
        </>
      )}
    </div>
  );
}
