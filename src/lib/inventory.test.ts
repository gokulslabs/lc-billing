import { describe, expect, it } from "vitest";
import {
  barcodeNumbers,
  barcodeSchema,
  formatPurchaseNumbers,
  groupPurchases,
  kolkataBounds,
  nextInventoryNo,
  quantityForUnit,
  shopDate,
} from "./inventory";

describe("nextInventoryNo", () => {
  it("starts at 1 when the shop has no stock rows", () => {
    expect(nextInventoryNo([])).toBe("1");
  });

  it("continues after the highest numeric inventory number", () => {
    expect(nextInventoryNo(["7", "12", "A4"])).toBe("13");
  });
});

describe("quantityForUnit", () => {
  it("keeps metres fractional and pieces whole", () => {
    expect(quantityForUnit("MT", 2.5)).toBeNull();
    expect(quantityForUnit("NO", 2.5)).toBe("Pieces must be a whole number.");
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
          { createdAt: "2025-09-27T04:30:00.000Z", inventoryNo: "1", productId: "p1", quantity: 1 },
          { createdAt: "2025-09-27T10:00:00.000Z", inventoryNo: "6", productId: "p1", quantity: 5 },
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
});
