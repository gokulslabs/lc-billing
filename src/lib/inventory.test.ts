import { describe, expect, it } from "vitest";
import { stockGap } from "./reports";
import {
  barcodeNumbers,
  barcodeSchema,
  formatPurchaseNumbers,
  groupPurchases,
  kolkataBounds,
  nextInventoryNo,
  quantityAfterReturn,
  quantityAfterSale,
  quantityForUnit,
  slipPlan,
  shopDate,
} from "./inventory";

describe("nextInventoryNo", () => {
  it("starts at 1 when the shop has no stock rows", () => {
    expect(nextInventoryNo([])).toBe("1");
  });

  it("continues after the highest numeric inventory number", () => {
    expect(nextInventoryNo(["7", "12", "A4"])).toBe("13");
  });

  it("continues an IN number instead of starting again at 1", () => {
    expect(nextInventoryNo(["IN0021287", "IN0021288", "1"])).toBe("IN0021289");
  });
});

describe("slipPlan", () => {
  it("gives each piece its own number and keeps metres on one slip", () => {
    expect(slipPlan("NO", 6, "")).toEqual({ count: 6, each: 1 });
    expect(slipPlan("NO", 6, "IN009")).toEqual({ count: 1, each: 6 });
    expect(slipPlan("MT", 2.5, "")).toEqual({ count: 1, each: 2.5 });
    expect(slipPlan("NO", 201, "")).toBe("Print at most 200 labels.");
  });
});

describe("quantityForUnit", () => {
  it("keeps metres fractional and pieces whole", () => {
    expect(quantityForUnit("MT", 2.5)).toBeNull();
    expect(quantityForUnit("NO", 2.5)).toBe("Pieces must be a whole number.");
  });
});

describe("shelf movement", () => {
  it("takes a piece and a length of fabric off the shelf when they are billed", () => {
    expect(quantityAfterSale(1, 1)).toBe(0);
    expect(stockGap(1, quantityAfterSale(1, 1), 1)).toBe(0);
    expect(quantityAfterSale(20.5, 9)).toBe(11.5);
    expect(stockGap(20.5, quantityAfterSale(20.5, 9), 9)).toBe(0);
  });

  it("puts a return back on the same number", () => {
    expect(quantityAfterReturn(0, 1)).toBe(1);
    expect(quantityAfterReturn(11.5, 2)).toBe(13.5);
  });
});

describe("groupPurchases", () => {
  it("groups one day's receipts for a product and keeps each inventory number", () => {
    const products = new Map([
      ["p1", { code: "SR-0002", name: "SALWAR RJ11", groupName: "SALWAR", unit: "NO" as const }],
    ]);
    expect(shopDate("2025-09-27T04:30:00.000Z")).toBe("2025-09-27");
    expect(
      groupPurchases(
        [
          { createdAt: "2025-09-27T04:30:00.000Z", inventoryNo: "1", productId: "p1", quantity: 1, supplierName: "Silk mill", supplierBillNo: "44", cost: 800 },
          { createdAt: "2025-09-27T10:00:00.000Z", inventoryNo: "6", productId: "p1", quantity: 5, supplierName: "Silk mill", supplierBillNo: "44", cost: 800 },
        ],
        products,
      ),
    ).toEqual([
      {
        date: "2025-09-27",
        productId: "p1",
        productCode: "SR-0002",
        groupName: "SALWAR",
        productName: "SALWAR RJ11",
        unit: "NO",
        quantity: 6,
        inventoryNos: ["1", "6"],
        supplierName: "Silk mill",
        supplierBillNo: "44",
        cost: 4800,
      },
    ]);
    expect(kolkataBounds("2025-09-27", "2025-09-27")).toEqual({
      start: "2025-09-27T00:00:00+05:30",
      end: "2025-09-28T00:00:00+05:30",
    });
    expect(kolkataBounds("2025-09-28", "2025-09-27")).toBeNull();
  });
});

describe("formatPurchaseNumbers", () => {
  it("shows a from–to range when the numbers run in order", () => {
    expect(formatPurchaseNumbers(["IN0003812", "IN0003814", "IN0003813"])).toBe("IN0003812 – IN0003814");
  });

  it("shows one number when the receipt is a single slip", () => {
    expect(formatPurchaseNumbers(["IN0003812"])).toBe("IN0003812");
  });

  it("shows a count when the numbers have a gap", () => {
    expect(formatPurchaseNumbers(["IN0003812", "IN0004014"])).toBe("2 numbers");
  });
});

describe("barcodeNumbers", () => {
  it("prints a run of labels from the starting number", () => {
    const parsed = barcodeSchema.parse({ starting: "007", quantity: 3 });
    expect(barcodeNumbers(parsed.starting, parsed.quantity)).toEqual(["007", "008", "009"]);
  });

  it("keeps the IN prefix on each label", () => {
    const parsed = barcodeSchema.parse({ starting: "IN0021288", quantity: 2 });
    expect(barcodeNumbers(parsed.starting, parsed.quantity)).toEqual(["IN0021288", "IN0021289"]);
  });
});
