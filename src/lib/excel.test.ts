import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { excelFile } from "./excel";

describe("excelFile", () => {
  it("writes an xlsx workbook Excel can open, with text escaped and amounts as numbers", () => {
    const file = excelFile([
      {
        name: "Bills: all",
        columns: ["Name", "Amount"],
        rows: [
          ["A & B", 12.5],
          [null, 0],
        ],
      },
      {
        name: "Payments",
        columns: ["Mode"],
        rows: [["Cash"]],
      },
    ]);
    const entries = unzip(file);
    expect(entries.has("[Content_Types].xml")).toBe(true);
    expect(entries.has("xl/workbook.xml")).toBe(true);
    const workbook = text(entries.get("xl/workbook.xml"));
    expect(workbook).toContain('name="Bills  all"');
    expect(workbook).toContain('name="Payments"');
    const sheet = text(entries.get("xl/worksheets/sheet1.xml"));
    expect(sheet).toContain("A &amp; B");
    expect(sheet).not.toContain("A & B");
    expect(sheet).toContain('<c r="B2"><v>12.5</v></c>');
    expect(sheet).toContain('<c r="B3"><v>0</v></c>');
    expect(sheet).toContain('state="frozen"');
    expect(text(entries.get("xl/worksheets/sheet2.xml"))).toContain("Cash");
  });
});

function text(bytes: Uint8Array | undefined): string {
  return new TextDecoder().decode(bytes ?? new Uint8Array());
}

function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map<string, Uint8Array>();
  let offset = 0;
  while (offset + 4 <= bytes.length) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const method = view.getUint16(offset + 8, true);
    const compressed = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
    const stored = bytes.slice(dataStart, dataStart + compressed);
    files.set(name, method === 0 ? stored : inflateRawSync(stored));
    offset = dataStart + compressed;
  }
  return files;
}
