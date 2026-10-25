import { describe, expect, it } from "vitest";
import { sumMoney, sumSales } from "./dashboard";

describe("sumSales", () => {
  it("adds today's bill lines in paise and thousandths", () => {
    expect(sumSales([{ quantity: 1.5, amount: 149.99 }, { quantity: 2, amount: 10 }])).toEqual({
      amount: 159.99,
      quantity: 3.5,
    });
  });
});

describe("sumMoney", () => {
  it("keeps collections separate from sales", () => {
    expect(sumMoney([100.1, 0.2])).toBe(100.3);
    expect(sumMoney([])).toBe(0);
  });
});
