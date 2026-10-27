import { describe, expect, it } from "vitest";
import { applyGroupDiscount, collectionProblem, lineAmount, nextBillNo, priceLine, returnQuantity, selectBills, type InvoiceSummary } from "./sales";

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

function bill(patch: Partial<InvoiceSummary>): InvoiceSummary {
  return {
    id: patch.id ?? "1",
    billNo: patch.billNo ?? "1",
    customerId: "c",
    customerName: patch.customerName ?? "A",
    billedOn: patch.billedOn ?? "2026-01-01",
    status: patch.status ?? "open",
    remarks: null,
    gross: patch.gross ?? 100,
    discount: patch.discount ?? 0,
    total: patch.total ?? 100,
    collected: patch.collected ?? 0,
    balance: patch.balance ?? 100,
  };
}

describe("selectBills", () => {
  const rows = [
    bill({ id: "a", billNo: "2", customerName: "Meena", billedOn: "2026-02-01", balance: 0, collected: 100, total: 100 }),
    bill({ id: "b", billNo: "10", customerName: "Anitha", billedOn: "2026-03-01", balance: 400, total: 500, collected: 100 }),
    bill({ id: "c", billNo: "3", customerName: "Anitha", billedOn: "2026-01-01", balance: 50, status: "cancelled" }),
  ];

  it("keeps only bills that still have a balance", () => {
    expect(selectBills(rows, "unpaid", "customer", "asc").map((row) => row.billNo)).toEqual(["10"]);
  });

  it("sorts bill numbers as numbers", () => {
    expect(selectBills(rows, "all", "bill", "asc").map((row) => row.billNo)).toEqual(["2", "3", "10"]);
  });

  it("puts the largest balance first", () => {
    expect(selectBills(rows, "all", "balance", "desc").map((row) => row.billNo)).toEqual(["10", "3", "2"]);
  });
});

describe("priceLine", () => {
  it("uses a typed rate and takes extra rupees off after the group discount", () => {
    expect(priceLine(1, 1000, 10)).toEqual({ rate: 1000, amount: 900 });
    expect(priceLine(1, 1000, 10, 800, 50)).toEqual({ rate: 800, amount: 670 });
  });
});

describe("returnQuantity", () => {
  it("returns part of a line and the whole line", () => {
    expect(returnQuantity(4, 400, 1)).toEqual({ quantity: 3, amount: 300 });
    expect(returnQuantity(2, 200, 2)).toEqual({ quantity: 0, amount: 0 });
    expect(returnQuantity(1, 100, 2)).toBe("That is more than this line.");
  });
});

describe("collectionProblem", () => {
  it("rejects a collection above the balance", () => {
    expect(collectionProblem(100, 100.01)).toBe("Amount is more than the balance.");
    expect(collectionProblem(100, 40)).toBeNull();
  });
});
