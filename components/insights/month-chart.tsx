"use client";

import { useRef, useState } from "react";
import { formatMoney, type Cents } from "@/lib/domain/money";
import { cn } from "@/lib/utils/cn";
import { monthLong, monthShort } from "./format";

const PLOT_PX = 160;

/** Clean axis steps (1, 2, 5 × 10ⁿ whole currency units) so ticks read 0 / 200 / 400. */
function scale(maxCents: Cents) {
  const maxUnits = Math.max(maxCents / 100, 1);
  const raw = maxUnits / 3;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag));
  const top = Math.ceil(maxUnits / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { topCents: top * 100, ticks };
}

function tickFormatter(currency: string, topUnits: number) {
  // In full under 10,000; compact above (one style per axis).
  const fmt = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: topUnits >= 10_000 ? 1 : 0,
    minimumFractionDigits: 0,
    notation: topUnits >= 10_000 ? "compact" : "standard",
  });
  return (units: number) => fmt.format(units);
}

/**
 * Monthly totals as columns (one series, so no legend; the section title names it). Tapping, hovering
 * or arrowing through the months shows that month's figure in the readout above the plot; every
 * column is a labelled radio, so a screen reader hears "June 2026, $412.00" for each month.
 * The latest month is the current one and reads "so far".
 */
export function MonthChart({
  points,
  currency,
  label,
}: {
  points: { month: string; cents: Cents }[];
  currency: string;
  /** Names the chart for assistive tech, e.g. "Your share by month". */
  label: string;
}) {
  const last = points.length - 1;
  const [selected, setSelected] = useState(last);
  const [hovered, setHovered] = useState<number | null>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const active = hovered ?? selected;

  const max = Math.max(0, ...points.map((p) => p.cents));
  const { topCents, ticks } = scale(max);
  const tick = tickFormatter(currency, topCents / 100);
  const dense = points.length > 8;

  const phrase = (i: number) => `${monthLong(points[i].month)}${i === last ? " so far" : ""}`;

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? Math.min(last, i + 1)
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? Math.max(0, i - 1)
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setSelected(next);
    buttons.current[next]?.focus();
  }

  return (
    <figure className="m-0">
      <figcaption className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-3" aria-hidden>
        <span className="text-body-sm text-ink-muted">{phrase(active)}</span>
        <span className="num text-title font-bold">{formatMoney(points[active].cents, currency)}</span>
      </figcaption>

      <div className="mt-2 flex pt-2">
        {/* Y axis: clean ticks, recessive. */}
        <div className="relative w-14 shrink-0" style={{ height: PLOT_PX }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="num absolute right-2 translate-y-1/2 text-meta leading-none text-ink-muted"
              style={{ bottom: `${(t * 100 * 100) / topCents}%` }}
            >
              {tick(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Hairline gridlines; the zero line doubles as the baseline. */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: PLOT_PX }} aria-hidden>
            {ticks.map((t) => (
              <div
                key={t}
                className={cn("absolute inset-x-0 h-px", t === 0 ? "bg-field" : "bg-rule")}
                style={{ bottom: `${(t * 100 * 100) / topCents}%` }}
              />
            ))}
          </div>

          <div
            role="radiogroup"
            aria-label={label}
            className="relative grid"
            style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
            onMouseLeave={() => setHovered(null)}
          >
            {points.map((p, i) => {
              const pct = topCents > 0 ? (p.cents / topCents) * 100 : 0;
              const on = i === active;
              // Dense (12 months): label every other month, always including the latest.
              const showLabel = !dense || (last - i) % 2 === 0;
              return (
                <button
                  key={p.month}
                  ref={(el) => {
                    buttons.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={i === selected}
                  aria-label={`${phrase(i)}, ${formatMoney(p.cents, currency)}`}
                  tabIndex={i === selected ? 0 : -1}
                  onClick={() => setSelected(i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onMouseEnter={() => setHovered(i)}
                  className="group flex min-w-0 flex-col items-stretch rounded-[6px] hover:bg-ink/[0.03]"
                >
                  <span className="flex items-end justify-center px-[3px]" style={{ height: PLOT_PX }} aria-hidden>
                    {p.cents > 0 ? (
                      <span
                        className={cn("block w-full max-w-6 rounded-t-[4px]", on ? "bg-ink" : "bg-ink-muted/70")}
                        style={{ height: `max(${pct}%, 2px)` }}
                      />
                    ) : null}
                  </span>
                  <span
                    className={cn("mt-1.5 block h-5 truncate text-center text-meta leading-5", on ? "font-semibold text-ink" : "text-ink-muted")}
                    aria-hidden
                  >
                    {showLabel || on ? monthShort(p.month) : ""}
                  </span>
                  {/* The selected month is also marked with a bar under its label (not colour alone). */}
                  <span className={cn("mx-auto mt-0.5 block h-0.5 w-4 rounded-full", i === selected ? "bg-ink" : "bg-transparent")} aria-hidden />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </figure>
  );
}
