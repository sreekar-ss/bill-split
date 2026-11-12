import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, parseAmountToCents } from "@/lib/domain/money";

describe("parseAmountToCents", () => {
  it.each([
    ["12", 1200], ["12.5", 1250], ["12.05", 1205], ["0.99", 99], [".5", 50],
    ["1,234.56", 123456], ["$7.10", 710], [" 3 ", 300], ["12.", 1200],
  ])("parses %s", (input, cents) => expect(parseAmountToCents(input)).toBe(cents));

  it.each(["", "abc", "1.234", "-5", "1e3", "1.2.3", "."])("rejects %s", (input) =>
    expect(parseAmountToCents(input)).toBeNull());
});

describe("formatting", () => {
  it("formats cents", () => {
    expect(formatMoney(1250)).toBe("$12.50");
    expect(formatMoney(-1250, "USD", { abs: true })).toBe("$12.50");
    expect(formatMoney(100000, "EUR")).toBe("€1,000.00");
  });
  it("round-trips input", () => {
    expect(centsToInput(1205)).toBe("12.05");
    expect(centsToInput(5)).toBe("0.05");
    expect(parseAmountToCents(centsToInput(98765))).toBe(98765);
  });
});
