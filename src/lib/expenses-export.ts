import {
  LEDGER_COLUMNS,
  TARGET_COLUMNS,
  expenseOpeningBalanceRows,
  expenseLedgerTotals,
  type ExpenseRecord,
} from "@/lib/expenses";
import type { ExcelCell, ExcelSheet } from "@/lib/excel";

const amountColumns = new Set([1, 2, 6, 7, 8, 9, 10]);
const blankLinesBetweenDays = 8;

function isLedgerSummary(record: ExpenseRecord): boolean {
  const label = (record.details[0] ?? "").trim().toUpperCase();
  const summaryLabel = (record.details[5] ?? "").trim().toUpperCase();
  return (
    label === "TOT EXPENSES" ||
    ["CASH RECIPETS", "CASH RECEIPTS", "CASH EXPENSES", "HAND CASH"].includes(summaryLabel)
  );
}

function numberOrText(value: string, numeric: boolean): ExcelCell {
  return numeric && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : value;
}

export function expenseExportSheets(
  records: ExpenseRecord[],
  from: string,
  to: string,
  startingBalance: number | null = null,
): ExcelSheet[] {
  const ledger: ExcelCell[][] = [];
  const rowStyles: Record<number, "total" | "handCash" | "header" | "dateMarker"> = {};
  const cellStyles: Record<
    number,
    Record<number, "greenText" | "redText" | "bold" | "boldLeft" | "boldRight">
  > = {};
  const grouped = new Map<string, ExpenseRecord[]>();
  const exportRecords = [...records, ...expenseOpeningBalanceRows(records, startingBalance)];
  for (const record of exportRecords
    .filter(
      (row) =>
        row.sheet === "ledger" &&
        row.details.some((cell) => cell.trim() !== "") &&
        !isLedgerSummary(row),
    )
    .sort((a, b) => {
      const dayOrder = a.entryDate.localeCompare(b.entryDate);
      if (dayOrder) return dayOrder;
      return Number(b.id.startsWith("opening-")) - Number(a.id.startsWith("opening-"));
    })) {
    const group = grouped.get(record.entryDate) ?? [];
    group.push(record);
    grouped.set(record.entryDate, group);
  }
  for (const [date, group] of grouped) {
    if (ledger.length) {
      for (let index = 0; index < blankLinesBetweenDays; index += 1) ledger.push([]);
      rowStyles[ledger.length] = "dateMarker";
      ledger.push(["", "", "", { date }]);
      rowStyles[ledger.length] = "header";
      ledger.push([...LEDGER_COLUMNS]);
      ledger.push([]);
    } else {
      ledger.push([]);
    }
    for (const record of group) {
      const dataRow = ledger.length;
      ledger.push(
        LEDGER_COLUMNS.map((_, index) =>
          numberOrText(record.details[index] ?? "", amountColumns.has(index)),
        ),
      );
      const pending = (record.details[10] ?? "").trim().toUpperCase();
      const status = (record.details[11] ?? "").trim().toUpperCase();
      if (pending === "NILL" || pending === "BILL PENDING")
        cellStyles[dataRow] = { ...cellStyles[dataRow], 10: "greenText" };
      if (["PAID", "CLEARED", "ADVANCE", "ADVANCE (2)"].includes(status))
        cellStyles[dataRow] = { ...cellStyles[dataRow], 11: "greenText" };
      else if (status.includes("NOT PAID") || status.includes("NOT CLEARED"))
        cellStyles[dataRow] = { ...cellStyles[dataRow], 11: "redText" };
    }
    const totals = expenseLedgerTotals(group);
    const footerRow = 5 + ledger.length;
    rowStyles[ledger.length] = "total";
    ledger.push([
      "TOT EXPENSES",
      totals.gpayCheque,
      totals.cashExpenses,
      "",
      "",
      "CASH RECIPETS ",
      totals.cashReceipts,
      "",
      totals.savingsAccount,
      totals.currentAccount,
      totals.billPending,
      "",
    ]);
    rowStyles[ledger.length] = "total";
    ledger.push([
      "SHREEDEVI MAM",
      "",
      "",
      "",
      "",
      "CASH EXPENSES",
      totals.cashExpenses,
      "",
      "",
      "",
      "",
      "",
    ]);
    rowStyles[ledger.length] = "handCash";
    ledger.push([
      "",
      "",
      "",
      "",
      "",
      "HAND CASH ",
      { formula: `H${footerRow}-H${footerRow + 1}`, result: totals.handCash },
      "",
      "",
      "",
      "",
      "",
    ]);
  }
  const target: ExcelCell[][] = records
    .filter((row) => row.sheet === "target")
    .map((record, index) => [
      index + 1,
      { date: record.entryDate },
      record.details[0] ?? "",
      record.details[1] ?? "",
      ...record.details.slice(2).map((value) => numberOrText(value, true)),
    ]);
  const roster = [
    ["D.LAKSHMI", "001"],
    ["P.BHUVANESWARI", "002"],
    ["DIVYA", "003"],
    ["REVATHI", "004"],
    ["KEERTHANA", "005"],
    ["BRINDHA", "006"],
    ["BHAVYA", "007"],
    ["NIROSHA", "008"],
  ];
  while (target.length < 46) {
    const index = target.length;
    target.push([index + 1, "", "", "", "", "", 0.01, ""]);
  }
  const targetCellStyles: Record<number, Record<number, "bold" | "boldLeft" | "boldRight">> = {
    4: { 13: "boldLeft", 14: "bold", 15: "boldRight" },
  };
  roster.forEach(([name, id], index) => {
    const row = target[index + 5]!;
    row[13] = index + 1;
    row[14] = name ?? "";
    row[15] = id ?? "";
  });
  const targetColumns = [...TARGET_COLUMNS, ...Array(8).fill("")];
  const targetHeaderStyles = Array(16).fill("default") as (
    "default" | "bold" | "boldLeft" | "boldRight"
  )[];
  targetHeaderStyles[0] = "boldLeft";
  for (const index of [1, 2, 3, 4, 5, 6]) targetHeaderStyles[index] = "bold";
  targetHeaderStyles[7] = "boldRight";
  const titleMonth =
    from.slice(0, 7) === to.slice(0, 7)
      ? new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
          .toLocaleString("en-GB", { month: "short", timeZone: "UTC" })
          .toUpperCase()
      : `${from} TO ${to}`;
  return [
    {
      name: "EXPENSES",
      columns: [...LEDGER_COLUMNS],
      rows: ledger,
      layout: {
        startColumn: 1,
        headerRow: 4,
        title: { date: grouped.keys().next().value ?? from },
        titleRow: 3,
        titleColumn: 4,
        rowStyles,
        cellStyles,
        grid: true,
        headerStyles: ["red", "red", "default", ...Array(8).fill("green"), "red"],
        columnWidths: [30.57, 27.86, 15.14, 30.71, 19.29, 18, 17.86, 15.14, 15, 12.71, 14.71, 18],
      },
    },
    {
      name: "TARGET WISE PAYMENT",
      columns: targetColumns,
      rows: target,
      layout: {
        startColumn: 4,
        headerRow: 5,
        title: `TARGET WISE PAYMENT DETAILS - ${titleMonth}`,
        titleEndColumn: 11,
        titleEndRow: 4,
        grid: true,
        headerStyles: targetHeaderStyles,
        cellStyles: targetCellStyles,
        bodyColumnStyles: {
          1: "date",
          2: "softFill",
          5: "currency",
          6: "percent",
          7: "currency",
          14: "roster",
        },
        columnWidths: [
          8, 13.57, 20.29, 13, 15.71, 14.71, 16.43, 13.43, 12, 12, 12, 12, 12, 8, 17.86, 12,
        ],
      },
    },
  ];
}
