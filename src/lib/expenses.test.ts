import { describe, expect, it } from "vitest";
import { expenseLedgerTotals, expenseWhatsAppUrl, type ExpenseRecord } from "./expenses";

describe("expenseLedgerTotals", () => {
  it("calculates the Excel hand-cash footer from detail rows only", () => {
    const records: ExpenseRecord[] = [
      {
        id: "1",
        sheet: "ledger",
        entryDate: "2026-11-14",
        details: ["TEA", "", "150", "", "", "", "11,880", "", "", "", "", ""],
      },
      {
        id: "2",
        sheet: "ledger",
        entryDate: "2026-11-14",
        details: [
          "SUPPLIER",
          "₹2,000",
          "2,800",
          "",
          "",
          "",
          "5,323",
          "800",
          "5,500",
          "7,743",
          "3,875",
          "",
        ],
      },
      {
        id: "5",
        sheet: "ledger",
        entryDate: "2026-11-14",
        details: ["CHEQUE", "221891 , CHEQUE NO : 106646", "", "", "", "", "", "", "", "", "", ""],
      },
      {
        id: "3",
        sheet: "ledger",
        entryDate: "2026-11-14",
        details: [
          "TOT EXPENSES",
          "2,000",
          "2,950",
          "",
          "",
          "CASH RECIPETS",
          "17,203",
          "",
          "",
          "",
          "",
          "",
        ],
      },
      { id: "4", sheet: "target", entryDate: "2026-11-14", details: ["", "", "", "", "", "9999"] },
    ];
    const url = expenseWhatsAppUrl(records, "14-11-2026");
    const text = decodeURIComponent(url!.split("text=")[1]!);
    expect(text).toContain("Ladies Collections\nExpenses 14-11-2026");
    expect(text).toContain("TEA\nCash: 150\nCash receipts: 11,880");
    expect(text).toContain("CHEQUE\nMam GPay / Cheque: 221891 , CHEQUE NO : 106646");
    expect(text).not.toContain("TOT EXPENSES\n");
    expect(text).toContain("Hand cash: 14,253");
    expect(url!.startsWith("https://wa.me/?text=")).toBe(true);

    expect(expenseLedgerTotals(records)).toEqual({
      gpayCheque: 223891,
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
