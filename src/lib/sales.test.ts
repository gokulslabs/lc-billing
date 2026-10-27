import { describe, expect, it } from "vitest";
import { applyGroupDiscount, collectionProblem, lineAmount, nextBillNo } from "./sales";

describe("nextBillNo", () => {
  it("starts at 1 for an empty shop", () => {
    expect(nextBillNo([])).toBe("1");
  });

  it("continues after the highest numeric bill", () => {
    expect(nextBillNo(["26270977", "12", "BILL-A"])).toBe("26270978");
  });
});

describe("lineAmount", () => {
  it("rounds the line to paise", () => {
    expect(lineAmount(1.5, 99.99)).toBe(149.99);
  });
});

describe("applyGroupDiscount", () => {
  it("takes the group percent off the line", () => {
    expect(applyGroupDiscount(1, 1000, 10)).toEqual({ gross: 1000, discount: 100, amount: 900 });
  });

  it("leaves a line alone when the group has no discount", () => {
    expect(applyGroupDiscount(2, 50, 0)).toEqual({ gross: 100, discount: 0, amount: 100 });
  });
});

describe("collectionProblem", () => {
  it("rejects a collection above the balance", () => {
    expect(collectionProblem(100, 100.01)).toBe("Amount is more than the balance.");
    expect(collectionProblem(100, 40)).toBeNull();
  });
});
