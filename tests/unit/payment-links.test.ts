import { describe, expect, it } from "vitest";
import { paymentLinks } from "@/lib/domain/payment-links";

const ben = { name: "Ben Ito", venmoHandle: "@ben-ito", paypalMe: "benito", cashTag: "$benito", upiId: "ben@okaxis" };

describe("paymentLinks", () => {
  it("builds prefilled links for USD", () => {
    const links = paymentLinks(ben, 4250, "USD", "Lisbon trip");
    expect(links.map((l) => l.method)).toEqual(["venmo", "paypal", "cashapp"]);
    const venmo = new URL(links[0].url);
    expect(venmo.searchParams.get("recipients")).toBe("ben-ito");
    expect(venmo.searchParams.get("amount")).toBe("42.50");
    expect(venmo.searchParams.get("note")).toBe("Lisbon trip");
    expect(links[1].url).toBe("https://paypal.me/benito/42.50USD");
    expect(links[2].url).toBe("https://cash.app/$benito/42.50");
  });

  it("only offers methods that support the currency", () => {
    expect(paymentLinks(ben, 1000, "EUR", "x").map((l) => l.method)).toEqual(["paypal"]);
    const inr = paymentLinks(ben, 50000, "INR", "Rent");
    expect(inr.map((l) => l.method)).toEqual(["upi"]);
    const upi = new URL(inr[0].url.replace("upi://", "https://"));
    expect(Object.fromEntries(upi.searchParams)).toMatchObject({ pa: "ben@okaxis", am: "500.00", cu: "INR", pn: "Ben Ito" });
  });

  it("returns nothing without handles or for zero amounts", () => {
    expect(paymentLinks({ name: "X" }, 1000, "USD", "x")).toEqual([]);
    expect(paymentLinks(ben, 0, "USD", "x")).toEqual([]);
  });
});
