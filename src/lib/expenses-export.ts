import { LEDGER_COLUMNS, TARGET_COLUMNS, type ExpenseRecord } from "@/lib/expenses";
import type { ExcelCell, ExcelSheet } from "@/lib/excel";

const amountColumns = new Set([1, 2, 6, 7, 8, 9, 10]);

function numberOrText(value: string, numeric: boolean): ExcelCell {
  return numeric && /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? Number(value) : value;
}

export function expenseExportSheets(records: ExpenseRecord[], from: string, to: string): ExcelSheet[] {
  const ledger: ExcelCell[][] = [];
  let lastDate = "";
  for (const record of records.filter((row) => row.sheet === "ledger")) {
    if (lastDate && record.entryDate !== lastDate) {
      ledger.push(["", "", "", record.entryDate]);
    }
    lastDate = record.entryDate;
    ledger.push(LEDGER_COLUMNS.map((_, index) => numberOrText(record.details[index] ?? "", amountColumns.has(index))));
  }
  const target = records.filter((row) => row.sheet === "target").map((record, index) => [
    index + 1,
    record.entryDate,
    record.details[0] ?? "",
    record.details[1] ?? "",
    ...record.details.slice(2).map((value) => numberOrText(value, true)),
  ]);
  return [
    { name: "EXPENSES", columns: [...LEDGER_COLUMNS], rows: ledger, layout: { startColumn: 1, headerRow: 4, title: records.find((row) => row.sheet === "ledger")?.entryDate ?? from, titleColumn: 4 } },
    { name: "TARGET WISE PAYMENT", columns: [...TARGET_COLUMNS], rows: target, layout: { startColumn: 4, headerRow: 5, title: `TARGET WISE PAYMENT DETAILS - ${from === to ? from : `${from} TO ${to}`}`, titleEndColumn: 11 } },
  ];
}
