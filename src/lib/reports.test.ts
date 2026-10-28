import { describe, expect, it } from "vitest";
import { billTotals, moneyBalance, monthStart, pendingTotals, pricedBill, rangeProblem, stockGap } from "./reports";

describe("billTotals", () => {
  it("keeps discount off the bill, the same way billing does", () => {
    expect(billTotals([100, 40.5])).toEqual({ gross: 140.5, discount: 0, net: 140.5 });
    expect(pricedBill([{ quantity: 1, rate: 1000, amount: 900 }])).toEqual({ gross: 1000, discount: 100, net: 900 });
  });
});

describe("moneyBalance", () => {
  it("is what is still owed on an open bill", () => {
    expect(moneyBalance(100, 40)).toBe(60);
  });
});

describe("pendingTotals", () => {
  it("equals the sum of the rows in one book", () => {
    const rows = [
      { invoiced: 1000, paid: 200, balance: 800 },
      { invoiced: 450.5, paid: 0, balance: 450.5 },
    ];
    expect(pendingTotals(rows)).toEqual({ invoiced: 1450.5, paid: 200, balance: 1250.5 });
    expect(pendingTotals(rows).balance).toBe(rows.reduce((sum, row) => sum + row.balance, 0));
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
