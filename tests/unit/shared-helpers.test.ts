import { describe, expect, it } from "vitest";
import { monthLong, monthShort } from "@/components/insights/format";
import { splitFailure } from "@/lib/client/run-action";
import { formatMonth, fromDateInput } from "@/lib/domain/dates";
import { personName } from "@/lib/utils/person";

describe("personName", () => {
  it("names the viewer You/you and everyone else by display name", () => {
    expect(personName({ id: "me", name: "Ana" }, "me", true)).toBe("You");
    expect(personName({ id: "me", name: "Ana" }, "me")).toBe("you");
    expect(personName({ id: "b", name: "Ben", status: "placeholder" }, "me", true)).toBe("Ben (invited)");
    expect(personName({ id: "z", name: "Zoe", status: "deleted" }, "me")).toBe("Deleted user");
  });
});

describe("month labels", () => {
  it("formats the UTC calendar month", () => {
    expect(formatMonth(fromDateInput("2026-06-01"))).toBe("June 2026");
    expect(formatMonth(new Date("2026-07-01T00:30:00.000Z"))).toBe("July 2026");
    expect(formatMonth(new Date("2026-06-30T23:30:00.000Z"))).toBe("June 2026");
    expect(monthLong("2026-06")).toBe("June 2026");
    expect(monthShort("2026-12")).toBe("Dec");
  });
});

describe("splitFailure", () => {
  it("shows the form error only when no field explains it", () => {
    expect(splitFailure(null)).toEqual({ fieldErrors: {}, formError: null });
    expect(splitFailure({ ok: true })).toEqual({ fieldErrors: {}, formError: null });
    expect(splitFailure({ ok: false, error: "Too many attempts." })).toEqual({ fieldErrors: {}, formError: "Too many attempts." });
    expect(splitFailure({ ok: false, error: "Enter a name.", fieldErrors: { name: "Enter a name." } })).toEqual({
      fieldErrors: { name: "Enter a name." },
      formError: null,
    });
  });
  it("lets ignored keys fall back to the form error", () => {
    const expired = { ok: false as const, error: "This link has expired.", fieldErrors: { token: "This link has expired." } };
    expect(splitFailure(expired, ["token"]).formError).toBe("This link has expired.");
    expect(splitFailure(expired).formError).toBeNull();
    expect(splitFailure({ ...expired, fieldErrors: { token: "x", password: "Too short." } }, ["token"]).formError).toBeNull();
  });
});
