import { describe, expect, it } from "vitest";
import { expenseExportSheets } from "./expenses-export";
import { excelFile } from "./excel";
import type { ExpenseRecord } from "./expenses";

describe("expenseExportSheets", () => {
  it("keeps the source workbook's two sheet layouts and date groups", () => {
    const records: ExpenseRecord[] = [
      { id: "a", sheet: "ledger", entryDate: "2026-11-01", details: ["TEA", "", "150", "OPENING BALANCES", "", "", "", "11880", "", "", "", ""] },
      { id: "b", sheet: "ledger", entryDate: "2026-11-02", details: ["BUS", "", "60", "", "", "", "", "", "", "", "", ""] },
      { id: "c", sheet: "target", entryDate: "2026-11-02", details: ["NIROSHA", "008", "3", "3850", "0.01", "38"] },
    ];
    const sheets = expenseExportSheets(records, "2026-11-01", "2026-11-02");
    expect(sheets.map((sheet) => sheet.name)).toEqual(["EXPENSES", "TARGET WISE PAYMENT"]);
    expect(sheets[0]?.layout).toMatchObject({ startColumn: 1, headerRow: 4, titleColumn: 4 });
    expect(sheets[0]?.rows[0]?.slice(0, 3)).toEqual(["TEA", "", 150]);
    expect(sheets[0]?.rows[1]).toEqual(["", "", "", "2026-11-02"]);
    expect(sheets[1]?.rows[0]?.[3]).toBe("008");
    const bytes = new TextDecoder().decode(excelFile(sheets));
    expect(bytes).toContain('r="B4"');
    expect(bytes).toContain('r="E3"');
    expect(bytes).toContain('r="E5"');
    expect(bytes).toContain('ref="E3:L3"');
  });
});
