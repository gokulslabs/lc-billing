export const LEDGER_COLUMNS = [
  "EXPENSCES",
  "MAM GPAY / CHEQUE",
  "CASH",
  "INCOME",
  "SALES BILL NO",
  "STITCHING B.NO",
  "CASH",
  "CARD",
  "S/A.C",
  "C/AC",
  "BILL PENDING",
  "PAYMENT STATUS",
] as const;
export const TARGET_COLUMNS = [
  "S.NO",
  "DATE",
  "NAMES",
  "ID NO",
  "SALES COUNT",
  "PRICE",
  "PERCENTAGE %",
  "AMOUNT",
] as const;
export type ExpenseRecord = {
  id: string;
  sheet: "ledger" | "target";
  entryDate: string;
  details: string[];
};
export const expenseColumns = (sheet: "ledger" | "target") =>
  sheet === "ledger" ? LEDGER_COLUMNS : TARGET_COLUMNS;

function amount(value: string): number {
  const match = value
    .trim()
    .replace(/^₹\s*/, "")
    .match(/^-?\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : 0;
}

function isImportedFooter(record: ExpenseRecord): boolean {
  const cells = record.details;
  const label = (cells[0] ?? "").trim().toUpperCase();
  const summaryLabel = (cells[5] ?? "").trim().toUpperCase();
  return (
    label === "TOT EXPENSES" ||
    ["CASH RECIPETS", "CASH RECEIPTS", "CASH EXPENSES", "HAND CASH"].includes(summaryLabel)
  );
}

const money = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const shareLabels = [
  "Mam GPay / Cheque",
  "Cash",
  "Income",
  "Sales bill no",
  "Stitching bill no",
  "Cash receipts",
  "Card",
  "Savings account",
  "Current account",
  "Bill pending",
  "Payment status",
];

export function expenseWhatsAppUrl(
  records: readonly ExpenseRecord[],
  period: string,
): string | null {
  const rows = records.filter((record) => record.sheet === "ledger" && !isImportedFooter(record));
  if (rows.length === 0) return null;
  const lines = ["Ladies Collections", `Expenses ${period}`];
  let previousDate = "";
  for (const record of rows) {
    if (record.entryDate !== previousDate) {
      lines.push("", record.entryDate.split("-").reverse().join("-"));
      previousDate = record.entryDate;
    }
    lines.push("", (record.details[0] ?? "").trim() || "Entry");
    record.details.slice(1).forEach((value, index) => {
      const text = value.trim();
      if (!text) return;
      lines.push(`${shareLabels[index]}: ${text}`);
    });
  }
  const totals = expenseLedgerTotals(records);
  lines.push(
    "",
    "Tot expenses",
    `Mam GPay / Cheque: ${money.format(totals.gpayCheque)}`,
    `Cash: ${money.format(totals.cashExpenses)}`,
    `Cash receipts: ${money.format(totals.cashReceipts)}`,
    `Card: ${money.format(totals.card)}`,
    `Savings account: ${money.format(totals.savingsAccount)}`,
    `Current account: ${money.format(totals.currentAccount)}`,
    `Bill pending: ${money.format(totals.billPending)}`,
    `Cash expenses: ${money.format(totals.cashExpenses)}`,
    `Hand cash: ${money.format(totals.handCash)}`,
  );
  return `https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`;
}

export function expenseLedgerTotals(records: readonly ExpenseRecord[]) {
  const totals = {
    gpayCheque: 0,
    cashExpenses: 0,
    cashReceipts: 0,
    card: 0,
    savingsAccount: 0,
    currentAccount: 0,
    billPending: 0,
    handCash: 0,
  };
  for (const record of records) {
    if (record.sheet !== "ledger" || isImportedFooter(record)) continue;
    const cells = record.details;
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
