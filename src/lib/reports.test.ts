import { describe, expect, it } from "vitest";
import { billTotals, moneyBalance, monthStart, rangeProblem, stockGap } from "./reports";

describe("billTotals", () => {
  it("keeps discount off the bill, the same way billing does", () => {
    expect(billTotals([100, 40.5])).toEqual({ gross: 140.5, discount: 0, net: 140.5 });
  });
});

describe("moneyBalance", () => {
  it("is what is still owed on an open bill", () => {
    expect(moneyBalance(100, 40)).toBe(60);
  });
});

describe("stockGap", () => {
  it("flags on-hand stock that does not match receipts minus billed quantity", () => {
    expect(stockGap(6, 5, 1)).toBe(0);
    expect(stockGap(6, 3, 1)).toBe(-2);
  });
});

describe("rangeProblem", () => {
  it("rejects a from date after the to date", () => {
    expect(rangeProblem("2026-10-25", "2026-10-01")).toBe("From date is after to date.");
    expect(monthStart("2026-10-25")).toBe("2026-10-01");
  });
});
