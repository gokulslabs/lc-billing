import { describe, expect, it } from "vitest";
import { expenseExportSheets } from "./expenses-export";
import { excelFile } from "./excel";
import type { ExpenseRecord } from "./expenses";

describe("expenseExportSheets", () => {
  it("keeps the source workbook's two sheet layouts and date groups", () => {
    const records: ExpenseRecord[] = [
      {
        id: "a",
        sheet: "ledger",
        entryDate: "2026-11-01",
        details: ["TEA", "", "150", "OPENING BALANCES", "", "", "11880", "", "", "", "", ""],
      },
      {
        id: "b",
        sheet: "ledger",
        entryDate: "2026-11-02",
        details: ["BUS", "", "60", "", "", "", "", "", "", "", "", ""],
      },
      {
        id: "c",
        sheet: "target",
        entryDate: "2026-11-02",
        details: ["NIROSHA", "008", "3", "3850", "0.01", "38"],
      },
    ];
    const sheets = expenseExportSheets(records, "2026-11-01", "2026-11-02");
    expect(sheets.map((sheet) => sheet.name)).toEqual(["EXPENSES", "TARGET WISE PAYMENT"]);
    expect(sheets[0]?.layout).toMatchObject({
      startColumn: 1,
      headerRow: 4,
      titleRow: 3,
      titleColumn: 4,
    });
    expect(sheets[0]?.rows[1]?.slice(0, 3)).toEqual(["TEA", "", 150]);
    const ledgerRows = sheets[0]?.rows ?? [];
    const totalsRow = ledgerRows.findIndex((row) => row[0] === "TOT EXPENSES");
    const nextDayMarker = ledgerRows.findIndex((row) => {
      const cell = row[3];
      return (
        typeof cell === "object" && cell !== null && "date" in cell && cell.date === "2026-11-02"
      );
    });
    expect(ledgerRows[totalsRow]).toEqual([
      "TOT EXPENSES",
      0,
      150,
      "",
      "",
      "CASH RECIPETS ",
      11880,
      "",
      0,
      0,
      0,
      "",
    ]);
    expect(ledgerRows[totalsRow + 2]?.[6]).toEqual({
      formula: `H${totalsRow + 5}-H${totalsRow + 6}`,
      result: 11730,
    });
    expect(ledgerRows[nextDayMarker]?.[3]).toEqual({ date: "2026-11-02" });
    expect(sheets[1]?.rows[0]?.[3]).toBe("008");
    expect(sheets[1]?.rows[5]?.slice(13)).toEqual([1, "D.LAKSHMI", "001"]);
    const bytes = new TextDecoder().decode(excelFile(sheets));
    expect(bytes).toContain('r="B4"');
    expect(bytes).toContain('<c r="E3" s="10"><v>46327</v>');
    expect(bytes).toContain('r="E5"');
    expect(bytes).toContain('ref="E3:L4"');
    expect(bytes).toContain('r="G10" t="inlineStr" s="2"');
    expect(bytes).toContain('<c r="H12" s="3"><f>H10-H11</f><v>11730</v>');
    expect(bytes).toContain("FFFF0000");
    expect(bytes).toContain("FF00B050");
    expect(bytes).toContain("FFFFC000");
  });
});
