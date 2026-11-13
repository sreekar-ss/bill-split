"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchExpensesAction } from "@/app/actions/search";
import { MonthlyFeed, type FeedItem } from "@/components/activity/feed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/page";
import { runAction } from "@/lib/client/run-action";
import type { SearchResult } from "@/lib/server/search";
import { cn } from "@/lib/utils/cn";
import { FilterSheet } from "./filter-sheet";
import {
  describeFilters,
  filtersFromQuery,
  filtersToQuery,
  parseFilters,
  SEARCH_MAX_LENGTH,
  toSearchInput,
  type ActivityFilters,
  type FilterKey,
  type FilterOption,
} from "./filters";

type SearchItem = SearchResult["items"][number];
type Results = { key: string; items: SearchItem[]; page: number; hasMore: boolean };

const DEBOUNCE_MS = 300;

function toFeedItem(item: SearchItem): FeedItem {
  return {
    type: "expense",
    id: item.id,
    date: item.date,
    createdAt: item.date,
    description: item.description,
    amountCents: item.amountCents,
    currency: item.currency,
    paidBy: item.paidBy,
    group: item.group,
    friend: item.friend,
    myStakeCents: item.myStakeCents,
    recurring: item.recurring,
  };
}

function countLine(results: Results) {
  const n = results.items.length;
  if (results.hasMore) return `More than ${n} expenses`;
  return n === 1 ? "1 expense" : `${n} expenses`;
}

/**
 * Search box + filters for the Activity page. With nothing active it shows `children` (the normal
 * feed); otherwise it shows matching expenses. The state lives in the URL (see ./filters), updated
 * with history.replaceState so typing never re-renders the server page. The server renders the
 * first page of results for the URL it was given (`initial`); anything else is fetched here.
 */
export function ActivitySearch({
  meId,
  groups,
  friends,
  initial,
  children,
}: {
  meId: string;
  groups: FilterOption[];
  friends: FilterOption[];
  /** First page for the URL's filters, rendered on the server. `key` is filtersToQuery of those filters. */
  initial: { key: string; result: SearchResult } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [key, setKey] = useState(() => filtersToQuery(parseFilters(params)));
  const filters = filtersFromQuery(key);
  const [query, setQuery] = useState(filters.q ?? "");
  const [results, setResults] = useState<Results | null>(() => (initial && initial.key === key ? { key, ...initial.result } : null));
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Latest committed key, for the debounce timer and async callbacks (only written in handlers).
  const keyRef = useRef(key);
  const timer = useRef<{ id?: ReturnType<typeof setTimeout> }>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const active = key !== "";
  const resultsKey = results?.key;
  const errorKey = error?.key;

  // Fetch the first page whenever the committed filters change and we don't already have them.
  useEffect(() => {
    if (!active || resultsKey === key || errorKey === key) return;
    let cancelled = false;
    void runAction(() => searchExpensesAction(toSearchInput(filtersFromQuery(key), 0))).then((res) => {
      if (cancelled) return;
      if (res.ok) setResults({ key, ...res.data });
      else setError({ key, message: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [active, key, resultsKey, errorKey]);

  useEffect(() => {
    const t = timer.current;
    return () => clearTimeout(t.id);
  }, []);

  function commit(next: ActivityFilters) {
    clearTimeout(timer.current.id);
    const k = filtersToQuery(next);
    if (k === keyRef.current) return;
    keyRef.current = k;
    setKey(k);
    setMoreError(null);
    if (!k) {
      // Back to the feed: drop old results so a later identical search fetches fresh ones.
      setResults(null);
      setError(null);
    }
    window.history.replaceState(null, "", k ? `${pathname}?${k}` : pathname);
  }

  const current = () => filtersFromQuery(keyRef.current);
  const typedQuery = (value: string) => value.trim().slice(0, SEARCH_MAX_LENGTH) || undefined;

  function onQueryChange(value: string) {
    setQuery(value);
    clearTimeout(timer.current.id);
    timer.current.id = setTimeout(() => commit({ ...current(), q: typedQuery(value) }), DEBOUNCE_MS);
  }

  function clearAll() {
    setQuery("");
    commit({});
    inputRef.current?.focus();
  }

  function removeFilter(k: FilterKey) {
    commit({ ...current(), q: typedQuery(query), [k]: undefined });
    filtersButtonRef.current?.focus();
  }

  async function showMore() {
    if (!results) return;
    const forKey = results.key;
    const shown = results.items.length;
    setLoadingMore(true);
    setMoreError(null);
    const res = await runAction(() => searchExpensesAction(toSearchInput(filtersFromQuery(forKey), results.page + 1)));
    setLoadingMore(false);
    if (keyRef.current !== forKey) return;
    if (!res.ok) {
      setMoreError(res.error);
      return;
    }
    setResults((prev) => {
      if (!prev || prev.key !== forKey) return prev;
      const seen = new Set(prev.items.map((i) => i.id));
      return { ...prev, items: [...prev.items, ...res.data.items.filter((i) => !seen.has(i.id))], page: res.data.page, hasMore: res.data.hasMore };
    });
    // Move focus to the first new row, so keyboard users continue where the list grew.
    requestAnimationFrame(() => listRef.current?.querySelectorAll<HTMLElement>("a[href]")[shown]?.focus());
  }

  const typing = (typedQuery(query) ?? "") !== (filters.q ?? "");
  const ready = results && results.key === key ? results : null;
  const failed = error && error.key === key ? error.message : null;
  const busy = active && (typing || (!ready && !failed));
  // The status line only says "Searching…" once a request is due; while someone is still typing it
  // keeps the last count, so screen readers aren't told "Searching…" on every keystroke.
  const searching = active && !ready && !failed;
  const chips = describeFilters(filters, { groups, friends });
  const shownSearch = active || typing;

  return (
    <div>
      <form
        role="search"
        aria-label="Expenses"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          commit({ ...current(), q: typedQuery(query) });
        }}
      >
        <div className="relative min-w-0 flex-1">
          <label htmlFor="activity-search" className="sr-only">
            Search expenses
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input
            ref={inputRef}
            id="activity-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            maxLength={SEARCH_MAX_LENGTH}
            placeholder="Search expenses"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                setQuery("");
                commit({ ...current(), q: undefined });
              }
            }}
            className="pl-10 pr-11 [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery("");
                commit({ ...current(), q: undefined });
                inputRef.current?.focus();
              }}
              className="absolute right-0 top-0 grid size-11 place-items-center rounded-[10px] text-ink-muted hover:text-ink"
            >
              <X className="size-[18px]" aria-hidden />
            </button>
          ) : null}
        </div>
        <Button ref={filtersButtonRef} variant="secondary" aria-haspopup="dialog" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal aria-hidden />
          {chips.length ? `Filters (${chips.length})` : "Filters"}
        </Button>
      </form>

      {chips.length ? (
        <ul aria-label="Active filters" className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button
                type="button"
                onClick={() => removeFilter(chip.key)}
                aria-label={`Remove filter: ${chip.label}`}
                className="inline-flex h-11 max-w-full items-center gap-1.5 rounded-[10px] border border-field bg-surface pl-3 pr-2.5 text-body-sm font-medium hover:bg-paper"
              >
                <span className="truncate">{chip.label}</span>
                <X className="size-4 shrink-0 text-ink-muted" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {shownSearch ? (
        <section aria-labelledby="activity-results-heading" className="mt-4">
          <h2 id="activity-results-heading" className="sr-only">
            Search results
          </h2>
          <div className="flex min-h-11 items-center justify-between gap-3 border-b border-rule pb-1">
            <p role="status" className="text-body-sm text-ink-muted">
              {searching ? "Searching…" : failed ? "Search didn't finish" : ready ? countLine(ready) : typing ? "Searching…" : null}
            </p>
            <Button variant="ghost" className="-mr-2 shrink-0" onClick={clearAll}>
              Clear
            </Button>
          </div>

          {failed && !typing ? (
            <div role="alert" className="mt-4 rounded-[10px] border border-owe/30 bg-owe/5 px-3 py-3 text-body-sm text-owe">
              <p>{failed}</p>
              <Button
                variant="secondary"
                size="md"
                className="mt-3"
                onClick={() => {
                  // This alert (and the button) unmounts on retry: keep focus on the search field,
                  // from where the status line announces "Searching…" and then the count.
                  inputRef.current?.focus();
                  setError(null);
                }}
              >
                Try again
              </Button>
            </div>
          ) : results ? (
            <ResultsList
              results={results}
              stale={busy || results.key !== key}
              meId={meId}
              listRef={listRef}
              onClear={clearAll}
              hasFilters={chips.length > 0}
              hasQuery={Boolean(filters.q)}
              loadingMore={loadingMore}
              moreError={moreError}
              onShowMore={showMore}
            />
          ) : (
            <ResultsSkeleton />
          )}
        </section>
      ) : (
        <div className="mt-6">{children}</div>
      )}

      <FilterSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        value={filters}
        groups={groups}
        friends={friends}
        onApply={(next) => commit({ ...next, q: typedQuery(query) })}
      />
    </div>
  );
}

function ResultsList({
  results,
  stale,
  meId,
  listRef,
  onClear,
  hasFilters,
  hasQuery,
  loadingMore,
  moreError,
  onShowMore,
}: {
  results: Results;
  stale: boolean;
  meId: string;
  listRef: React.RefObject<HTMLDivElement | null>;
  onClear: () => void;
  hasFilters: boolean;
  /** A text query is set (as well as, or instead of, filters). */
  hasQuery: boolean;
  loadingMore: boolean;
  moreError: string | null;
  onShowMore: () => void;
}) {
  if (results.items.length === 0) {
    if (stale) return <ResultsSkeleton />;
    return (
      <EmptyState
        title="No matching expenses"
        body={
          hasFilters && hasQuery
            ? "Nothing matches this search and these filters. Try a different word, remove a filter, or clear everything."
            : hasFilters
              ? "No expenses match these filters. Remove one, or clear them all."
              : "Nothing matches this search. Try a different word, or search for part of it."
        }
        action={
          <Button variant="secondary" onClick={onClear}>
            {hasFilters && hasQuery ? "Clear search and filters" : hasFilters ? "Clear filters" : "Clear search"}
          </Button>
        }
      />
    );
  }
  return (
    <div ref={listRef} aria-busy={stale} className={cn("pt-4 transition-opacity motion-reduce:transition-none", stale && "opacity-50")}>
      <MonthlyFeed items={results.items.map(toFeedItem)} meId={meId} label="Matching expenses" />
      {results.hasMore || moreError ? (
        <div className="mt-4 space-y-2">
          {moreError ? (
            <p role="alert" className="text-body-sm text-owe">
              {moreError}
            </p>
          ) : null}
          {results.hasMore ? (
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              aria-disabled={loadingMore || stale}
              onClick={() => {
                // aria-disabled (not disabled) so focus stays on the button while the next page loads.
                if (!loadingMore && !stale) onShowMore();
              }}
            >
              {loadingMore ? "Loading more…" : "Show more"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div aria-hidden className="pt-2">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-rule py-3">
          <Skeleton className="size-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
    </div>
  );
}
