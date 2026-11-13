import { describe, expect, it } from "vitest";
import { anchorFor, describeSchedule, nextOccurrence, occurrencesBetween } from "@/lib/domain/recurrence";

describe("weekly", () => {
  const mondays = { frequency: "weekly" as const, interval: 1, anchorDay: 1 };
  it("finds the next weekday, never the same day", () => {
    expect(nextOccurrence(mondays, "2026-11-13")).toBe("2026-11-16"); // Fri → Mon
    expect(nextOccurrence(mondays, "2026-11-16")).toBe("2026-11-23"); // Mon → next Mon
  });
  it("supports every N weeks", () => {
    expect(nextOccurrence({ ...mondays, interval: 2 }, "2026-11-16")).toBe("2026-11-30");
    expect(nextOccurrence({ ...mondays, interval: 2 }, "2026-11-13")).toBe("2026-11-23");
  });
});

describe("monthly", () => {
  const on31 = { frequency: "monthly" as const, interval: 1, anchorDay: 31 };
  it("clamps to short months and goes back to the anchor afterwards", () => {
    expect(nextOccurrence(on31, "2027-01-31")).toBe("2027-02-28");
    expect(nextOccurrence(on31, "2027-02-28")).toBe("2027-03-31");
    expect(nextOccurrence(on31, "2028-01-31")).toBe("2028-02-29"); // leap year
    expect(nextOccurrence(on31, "2027-03-31")).toBe("2027-04-30");
  });
  it("uses later this month when the anchor hasn't passed", () => {
    expect(nextOccurrence({ frequency: "monthly", interval: 1, anchorDay: 15 }, "2026-11-13")).toBe("2026-11-15");
    expect(nextOccurrence({ frequency: "monthly", interval: 1, anchorDay: 1 }, "2026-11-13")).toBe("2026-12-01");
  });
  it("supports every N months and year rollover", () => {
    expect(nextOccurrence({ frequency: "monthly", interval: 3, anchorDay: 5 }, "2026-11-05")).toBe("2027-02-05");
    expect(nextOccurrence({ frequency: "monthly", interval: 1, anchorDay: 5 }, "2026-12-05")).toBe("2027-01-05");
  });
});

describe("helpers", () => {
  it("derives anchors from a start date", () => {
    expect(anchorFor("weekly", "2026-11-16")).toBe(1);
    expect(anchorFor("monthly", "2026-11-30")).toBe(30);
  });
  it("lists catch-up occurrences with a cap", () => {
    const s = { frequency: "weekly" as const, interval: 1, anchorDay: 5 };
    expect(occurrencesBetween(s, "2026-11-13", "2026-12-04")).toEqual(["2026-11-20", "2026-11-27", "2026-12-04"]);
    expect(occurrencesBetween(s, "2020-01-01", "2026-12-04", 5)).toHaveLength(5);
    expect(occurrencesBetween(s, "2026-11-13", "2026-11-19")).toEqual([]);
  });
  it("describes schedules in words", () => {
    expect(describeSchedule({ frequency: "weekly", interval: 1, anchorDay: 1 })).toBe("Every Monday");
    expect(describeSchedule({ frequency: "weekly", interval: 2, anchorDay: 5 })).toBe("Every 2 weeks on Friday");
    expect(describeSchedule({ frequency: "monthly", interval: 1, anchorDay: 1 })).toBe("Monthly on the 1st");
    expect(describeSchedule({ frequency: "monthly", interval: 1, anchorDay: 31 })).toBe("Monthly on the last day");
    expect(describeSchedule({ frequency: "monthly", interval: 1, anchorDay: 22 })).toBe("Monthly on the 22nd");
  });
});
