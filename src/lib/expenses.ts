export const LEDGER_COLUMNS = ["EXPENSCES", "MAM GPAY / CHEQUE", "CASH", "INCOME", "SALES BILL NO", "STITCHING B.NO", "CASH", "CARD", "S/A.C", "C/AC", "BILL PENDING", "PAYMENT STATUS"] as const;
export const TARGET_COLUMNS = ["S.NO", "DATE", "NAMES", "ID NO", "SALES COUNT", "PRICE", "PERCENTAGE %", "AMOUNT"] as const;
export type ExpenseRecord = { id: string; sheet: "ledger" | "target"; entryDate: string; details: string[] };
export const expenseColumns = (sheet: "ledger" | "target") => sheet === "ledger" ? LEDGER_COLUMNS : TARGET_COLUMNS;
