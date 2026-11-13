import { describe, expect, it } from "vitest";
import { fullMonthAverage } from "@/lib/domain/insights";

const m = (...cents: number[]) => cents.map((c, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, cents: c }));

describe("fullMonthAverage", () => {
  it("averages complete months from the first one with spending, leaving out the current month", () => {
    // Jan–Mar empty, Apr 100, May 0, Jun 200, Jul (current) 5000.
    expect(fullMonthAverage(m(0, 0, 0, 100, 0, 200, 5000))).toEqual({ label: "Average per full month", cents: 100, since: "April 2026" });
  });
  it("shows last month when there aren't two complete months to average", () => {
    expect(fullMonthAverage(m(0, 0, 3000, 2000))).toEqual({ label: "Last month", cents: 3000 });
    expect(fullMonthAverage(m(0, 0, 0, 2000))).toEqual({ label: "Last month", cents: 0 });
    expect(fullMonthAverage(m(2000))).toEqual({ label: "Last month", cents: 0 });
  });
});
