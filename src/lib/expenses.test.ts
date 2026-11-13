import { describe, expect, it } from "vitest";
import { expenseLedgerTotals, type ExpenseRecord } from "./expenses";

describe("expenseLedgerTotals", () => {
  it("calculates the Excel hand-cash footer from detail rows only", () => {
    const records: ExpenseRecord[] = [
      { id: "1", sheet: "ledger", entryDate: "2026-11-14", details: ["TEA", "", "150", "", "", "", "11,880", "", "", "", "", ""] },
      { id: "2", sheet: "ledger", entryDate: "2026-11-14", details: ["SUPPLIER", "₹2,000", "2,800", "", "", "", "5,323", "800", "5,500", "7,743", "3,875", ""] },
      { id: "3", sheet: "ledger", entryDate: "2026-11-14", details: ["TOT EXPENSES", "2,000", "2,950", "", "", "CASH RECIPETS", "17,203", "", "", "", "", ""] },
      { id: "4", sheet: "target", entryDate: "2026-11-14", details: ["", "", "", "", "", "9999"] },
    ];
    expect(expenseLedgerTotals(records)).toEqual({
      gpayCheque: 2000,
      cashExpenses: 2950,
      cashReceipts: 17203,
      card: 800,
      savingsAccount: 5500,
      currentAccount: 7743,
      billPending: 3875,
      handCash: 14253,
    });
  });
});
