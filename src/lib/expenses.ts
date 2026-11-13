export const LEDGER_COLUMNS = ["EXPENSCES", "MAM GPAY / CHEQUE", "CASH", "INCOME", "SALES BILL NO", "STITCHING B.NO", "CASH", "CARD", "S/A.C", "C/AC", "BILL PENDING", "PAYMENT STATUS"] as const;
export const TARGET_COLUMNS = ["S.NO", "DATE", "NAMES", "ID NO", "SALES COUNT", "PRICE", "PERCENTAGE %", "AMOUNT"] as const;
export type ExpenseRecord = { id: string; sheet: "ledger" | "target"; entryDate: string; details: string[] };
export const expenseColumns = (sheet: "ledger" | "target") => sheet === "ledger" ? LEDGER_COLUMNS : TARGET_COLUMNS;

function amount(value: string): number {
  const cleaned = value.trim().replace(/[₹,\s]/g, "");
  return /^-?\d+(?:\.\d+)?$/.test(cleaned) ? Number(cleaned) : 0;
}

export function expenseLedgerTotals(records: ExpenseRecord[]) {
  const totals = { gpayCheque: 0, cashExpenses: 0, cashReceipts: 0, card: 0, savingsAccount: 0, currentAccount: 0, billPending: 0, handCash: 0 };
  for (const record of records) {
    if (record.sheet !== "ledger") continue;
    const cells = record.details;
    const label = (cells[0] ?? "").trim().toUpperCase();
    const summaryLabel = (cells[5] ?? "").trim().toUpperCase();
    // Imported Excel footers contain pre-calculated totals; including them would count rows twice.
    if (label === "TOT EXPENSES" || ["CASH RECIPETS", "CASH RECEIPTS", "CASH EXPENSES", "HAND CASH"].includes(summaryLabel)) continue;
    totals.gpayCheque += amount(cells[1] ?? "");
    totals.cashExpenses += amount(cells[2] ?? "");
    totals.cashReceipts += amount(cells[6] ?? "");
    totals.card += amount(cells[7] ?? "");
    totals.savingsAccount += amount(cells[8] ?? "");
    totals.currentAccount += amount(cells[9] ?? "");
    totals.billPending += amount(cells[10] ?? "");
  }
  totals.handCash = totals.cashReceipts - totals.cashExpenses;
  return totals;
}
