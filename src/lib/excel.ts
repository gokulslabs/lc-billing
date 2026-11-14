export type ExcelCell = string | number | null | { date: string } | { formula: string; result: number };

export type ExcelSheet = {
  name: string;
  columns: string[];
  rows: ExcelCell[][];
  layout?: {
    startColumn: number;
    headerRow: number;
    title?: ExcelCell;
    titleRow?: number;
    titleColumn?: number;
    titleEndColumn?: number;
    titleEndRow?: number;
    columnWidths?: number[];
    headerStyles?: ("red" | "green" | "default")[];
    rowStyles?: Record<number, "total" | "handCash">;
    grid?: boolean;
  };
};

const encoder = new TextEncoder();

export function excelFile(sheets: ExcelSheet[]): Uint8Array {
  const used = new Set<string>();
  const named = (sheets.length > 0 ? sheets : [{ name: "Sheet", columns: [], rows: [] }]).map((sheet, index) => ({
    sheet,
    name: uniqueSheetName(sheet.name, used),
    index,
  }));
  const entries: { name: string; data: Uint8Array }[] = [
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes(named.length)) },
    { name: "_rels/.rels", data: encoder.encode(rootRels()) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook(named.map((item) => item.name))) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(workbookRels(named.length)) },
    { name: "xl/styles.xml", data: encoder.encode(styles()) },
  ];
  for (const item of named) {
    entries.push({ name: `xl/worksheets/sheet${item.index + 1}.xml`, data: encoder.encode(worksheet(item.sheet)) });
  }
  return zipStore(entries);
}

export function downloadExcel(filename: string, sheets: ExcelSheet[]) {
  const file = excelFile(sheets);
  const copy = new ArrayBuffer(file.byteLength);
  new Uint8Array(copy).set(file);
  const blob = new Blob([copy], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

function worksheet(sheet: ExcelSheet): string {
  const start = sheet.layout?.startColumn ?? 0;
  const headerRow = sheet.layout?.headerRow ?? 1;
  const width = Math.max(sheet.columns.length, ...sheet.rows.map((row) => row.length), 1);
  const columns = Array.from({ length: width }, (_, index) => sheet.columns[index] ?? "");
  const header = columns.map((column, index) => stringCell(headerRow, start + index, column, sheet.layout?.headerStyles?.[index] === "red" ? 4 : sheet.layout?.headerStyles?.[index] === "green" ? 5 : 1)).join("");
  const body = sheet.rows
    .map((row, rowIndex) => {
      const rowNumber = headerRow + rowIndex + 1;
      const rowStyle = sheet.layout?.rowStyles?.[rowIndex];
      const style = rowStyle === "total" ? 2 : rowStyle === "handCash" ? 3 : sheet.layout?.grid ? 6 : 0;
      const cells = columns.map((_, index) => cell(rowNumber, start + index, row[index] ?? null, style)).join("");
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join("");
  const cols = columns
    .map((column, index) => {
      const columnWidth = sheet.layout?.columnWidths?.[index] ?? Math.min(40, Math.max(12, column.length + 2));
      return `<col min="${start + index + 1}" max="${start + index + 1}" width="${columnWidth}" customWidth="1"/>`;
    })
    .join("");
  const titleColumn = sheet.layout?.titleColumn ?? start;
  const titleRow = sheet.layout?.titleRow ?? headerRow - 2;
  const preHeader = Array.from({ length: headerRow - 1 }, (_, index) => index + 1).map((row) => row === titleRow && sheet.layout?.title ? `<row r="${row}">${cell(row, titleColumn, sheet.layout.title, 7)}</row>` : `<row r="${row}"/>`).join("");
  const titleMerge = sheet.layout?.titleEndColumn != null ? `<mergeCells count="1"><mergeCell ref="${address(titleRow, titleColumn)}:${address(sheet.layout.titleEndRow ?? titleRow, sheet.layout.titleEndColumn)}"/></mergeCells>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="${address(headerRow + 1, start)}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${preHeader}<row r="${headerRow}">${header}</row>${body}</sheetData>${titleMerge}
</worksheet>`;
}

function cell(row: number, index: number, value: ExcelCell, style = 0): string {
  if (value && typeof value === "object") {
    if ("formula" in value) return `<c r="${address(row, index)}"${style ? ` s="${style}"` : ""}><f>${xml(value.formula)}</f><v>${value.result}</v></c>`;
    const serial = Math.round((Date.parse(`${value.date}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86400000);
    return Number.isFinite(serial) ? `<c r="${address(row, index)}" s="8"><v>${serial}</v></c>` : stringCell(row, index, value.date, style);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${address(row, index)}"${style ? ` s="${style}"` : ""}><v>${value}</v></c>`;
  }
  return stringCell(row, index, value == null ? "" : String(value), style);
}

function stringCell(row: number, index: number, value: string, style = 0): string {
  return `<c r="${address(row, index)}" t="inlineStr"${style ? ` s="${style}"` : ""}><is><t xml:space="preserve">${xml(clean(value))}</t></is></c>`;
}

function address(row: number, index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return `${letters}${row}`;
}

function uniqueSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Sheet";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${n}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function contentTypes(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) => {
    const part = `/xl/worksheets/sheet${index + 1}.xml`;
    return `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}
</Types>`;
}

function rootRels(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbook(names: string[]): string {
  const sheets = names
    .map((name, index) => `<sheet name="${xml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets}</sheets>
</workbook>`;
}

function workbookRels(count: number): string {
  const sheets = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return `<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/>`;
  }).join("");
  const styles = `<Relationship Id="rId${count + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets}${styles}
</Relationships>`;
}

function styles(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd-mmm-yy"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="12"/><color rgb="FFFF0000"/><name val="Calibri"/></font><font><sz val="12"/><color rgb="FF00B050"/><name val="Calibri"/></font><font><b/><sz val="20"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC000"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function clean(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function zipStore(entries: { name: string; data: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(8, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    parts.push(local, entry.data);
    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint32(16, crc, true);
    directoryView.setUint32(20, entry.data.length, true);
    directoryView.setUint32(24, entry.data.length, true);
    directoryView.setUint16(28, name.length, true);
    directoryView.setUint32(42, offset, true);
    directory.set(name, 46);
    central.push(directory);
    offset += local.length + entry.data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const bytes = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  for (const part of [...parts, ...central, end]) {
    bytes.set(part, position);
    position += part.length;
  }
  return bytes;
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  CRC_TABLE[index] = value;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
