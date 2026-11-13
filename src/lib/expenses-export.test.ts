import { describe, expect, it } from "vitest";
import { expenseExportSheets } from "./expenses-export";
import { excelFile } from "./excel";
import type { ExpenseRecord } from "./expenses";

describe("expenseExportSheets", () => {
  it("keeps the source workbook's two sheet layouts and date groups", () => {
    const records: ExpenseRecord[] = [
      { id: "a", sheet: "ledger", entryDate: "2026-11-01", details: ["TEA", "", "150", "OPENING BALANCES", "", "", "11880", "", "", "", "", ""] },
      { id: "b", sheet: "ledger", entryDate: "2026-11-02", details: ["BUS", "", "60", "", "", "", "", "", "", "", "", ""] },
      { id: "c", sheet: "target", entryDate: "2026-11-02", details: ["NIROSHA", "008", "3", "3850", "0.01", "38"] },
    ];
    const sheets = expenseExportSheets(records, "2026-11-01", "2026-11-02");
    expect(sheets.map((sheet) => sheet.name)).toEqual(["EXPENSES", "TARGET WISE PAYMENT"]);
    expect(sheets[0]?.layout).toMatchObject({ startColumn: 1, headerRow: 4, titleRow: 3, titleColumn: 4 });
    expect(sheets[0]?.rows[1]?.slice(0, 3)).toEqual(["TEA", "", 150]);
    expect(sheets[0]?.rows[2]).toEqual(["TOT EXPENSES", 0, 150, "", "", "CASH RECIPETS ", 11880, "", 0, 0, 0, ""]);
    expect(sheets[0]?.rows[4]?.[6]).toBe(11730);
    expect(sheets[0]?.rows[6]?.[3]).toEqual({ date: "2026-11-02" });
    expect(sheets[1]?.rows[0]?.[3]).toBe("008");
    expect(sheets[1]?.rows[4]?.slice(13)).toEqual(["S.NO", "NAMES", "ID NO"]);
    const bytes = new TextDecoder().decode(excelFile(sheets));
    expect(bytes).toContain('r="B4"');
    expect(bytes).toContain('<c r="E3" s="8"><v>46327</v>');
    expect(bytes).toContain('r="E5"');
    expect(bytes).toContain('ref="E3:L4"');
    expect(bytes).toContain('r="G7" t="inlineStr" s="2"');
  });
});
