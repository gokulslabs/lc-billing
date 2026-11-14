import { LEDGER_COLUMNS, TARGET_COLUMNS, expenseLedgerTotals, type ExpenseRecord } from "@/lib/expenses";
import type { ExcelCell, ExcelSheet } from "@/lib/excel";

const amountColumns = new Set([1, 2, 6, 7, 8, 9, 10]);
const minimumDailyLines = 40;
const betweenDaysBlankLines = 8;

function numberOrText(value: string, numeric: boolean): ExcelCell {
  return numeric && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : value;
}

export function expenseExportSheets(records: ExpenseRecord[], from: string, to: string): ExcelSheet[] {
  const ledger: ExcelCell[][] = [];
  const rowStyles: Record<number, "total" | "handCash"> = {};
  const grouped = new Map<string, ExpenseRecord[]>();
  for (const record of records.filter((row) => row.sheet === "ledger").sort((a, b) => a.entryDate.localeCompare(b.entryDate))) {
    const group = grouped.get(record.entryDate) ?? [];
    group.push(record);
    grouped.set(record.entryDate, group);
  }
  for (const [date, group] of grouped) {
    if (ledger.length) {
      for (let index = 0; index < betweenDaysBlankLines; index += 1) ledger.push([]);
      ledger.push(["", "", "", { date }]);
    }
    ledger.push([]);
    for (const record of group) ledger.push(LEDGER_COLUMNS.map((_, index) => numberOrText(record.details[index] ?? "", amountColumns.has(index))));
    for (let index = group.length; index < minimumDailyLines; index += 1) ledger.push([]);
    const totals = expenseLedgerTotals(group);
    const footerRow = 5 + ledger.length;
    rowStyles[ledger.length] = "total";
    ledger.push(["TOT EXPENSES", totals.gpayCheque, totals.cashExpenses, "", "", "CASH RECIPETS ", totals.cashReceipts, "", totals.savingsAccount, totals.currentAccount, totals.billPending, ""]);
    rowStyles[ledger.length] = "total";
    ledger.push(["SHREEDEVI MAM", "", "", "", "", "CASH EXPENSES", totals.cashExpenses, "", "", "", "", ""]);
    rowStyles[ledger.length] = "handCash";
    ledger.push(["", "", "", "", "", "HAND CASH ", { formula: `H${footerRow}-H${footerRow + 1}`, result: totals.handCash }, "", "", "", "", ""]);
  }
  const target: ExcelCell[][] = records.filter((row) => row.sheet === "target").map((record, index) => [
    index + 1,
    { date: record.entryDate },
    record.details[0] ?? "",
    record.details[1] ?? "",
    ...record.details.slice(2).map((value) => numberOrText(value, true)),
  ]);
  const roster = [
    ["D.LAKSHMI", "001"], ["P.BHUVANESWARI", "002"], ["DIVYA", "003"], ["REVATHI", "004"],
    ["KEERTHANA", "005"], ["BRINDHA", "006"], ["BHAVYA", "007"], ["NIROSHA", "008"],
  ];
  while (target.length < 13) target.push([]);
  target[4]![13] = "S.NO"; target[4]![14] = "NAMES"; target[4]![15] = "ID NO";
  roster.forEach(([name, id], index) => { const row = target[index + 5]!; row[13] = index + 1; row[14] = name ?? ""; row[15] = id ?? ""; });
  const titleMonth = from.slice(0, 7) === to.slice(0, 7)
    ? new Date(`${from.slice(0, 7)}-01T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase()
    : `${from} TO ${to}`;
  return [
    { name: "EXPENSES", columns: [...LEDGER_COLUMNS], rows: ledger, layout: { startColumn: 1, headerRow: 4, title: { date: grouped.keys().next().value ?? from }, titleRow: 3, titleColumn: 4, rowStyles, grid: true, headerStyles: ["red", "red", "default", ...Array(8).fill("green"), "red"], columnWidths: [30.57, 27.86, 15.14, 30.71, 19.29, 18, 17.86, 15.14, 15, 12.71, 14.71, 18] } },
    { name: "TARGET WISE PAYMENT", columns: [...TARGET_COLUMNS, ...Array(8).fill("")], rows: target, layout: { startColumn: 4, headerRow: 5, title: `TARGET WISE PAYMENT DETAILS - ${titleMonth}`, titleEndColumn: 11, titleEndRow: 4, grid: true, columnWidths: [8, 13.57, 20.29, 13, 15.71, 14.71, 16.43, 13.43, 12, 12, 12, 12, 12, 8, 17.86, 12] } },
  ];
}
