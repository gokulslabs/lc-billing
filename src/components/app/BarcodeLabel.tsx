import type { ReactNode } from "react";
import { code128Widths } from "@/lib/barcode";

export type BarcodeLabel = { number: string; price: number; caption?: string };

export function BarcodeMark({ value }: { value: string }) {
  const widths = code128Widths(value);
  if (!widths) return <span className="text-xs">{value}</span>;
  const height = 30;
  let x = 0;
  const bars: ReactNode[] = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0)
      bars.push(<rect key={index} x={x} y={0} width={width} height={height} fill="black" />);
    x += width;
  });
  return (
    <svg
      viewBox={`0 0 ${x} ${height}`}
      width={x}
      height={height}
      role="img"
      aria-label={value}
      className="mx-auto"
    >
      {bars}
    </svg>
  );
}

function stickerPrice(price: number): string {
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  return `₹ ${amount}`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function barcodeLabelsDocument(labels: BarcodeLabel[]): string {
  const rows: BarcodeLabel[][] = [];
  for (let index = 0; index < labels.length; index += 3) rows.push(labels.slice(index, index + 3));
  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map((label) => {
            const widths = code128Widths(label.number);
            let x = 0;
            const bars =
              widths
                ?.flatMap((width, index) => {
                  const start = x;
                  x += width;
                  return index % 2 === 0
                    ? [`<rect x="${start}" y="0" width="${width}" height="30"/>`]
                    : [];
                })
                .join("") ?? "";
            const barcode = widths
              ? `<svg viewBox="0 0 ${x} 30" role="img" aria-label="${escapeHtml(label.number)}">${bars}</svg>`
              : "";
            return `<td><p class="brand">LADIES COLLECTION</p>${barcode}<p class="number">${escapeHtml(label.number)}</p><p class="price">${escapeHtml(stickerPrice(label.price))}</p></td>`;
          })
          .join("")}</tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Barcode labels</title><style>
    *{box-sizing:border-box} @page{margin:5mm} html,body{margin:0;padding:0;background:#fff;color:#000;font-family:Arial,sans-serif}
    body{width:500px;max-width:100%} table{width:100%;table-layout:fixed;border-collapse:collapse;text-align:center}
    tr{break-inside:avoid;page-break-inside:avoid} td{width:33.333%;padding:2mm 1mm;vertical-align:top;font-weight:700;break-inside:avoid;page-break-inside:avoid}
    p{margin:1mm 0}.brand,.number{font-size:9pt}.price{font-size:12pt} svg{display:block;width:100%;height:8mm;fill:#000}
  </style></head><body><table><tbody>${body}</tbody></table></body></html>`;
}

export function LabelSheet({ labels }: { labels: BarcodeLabel[] }) {
  const rows: BarcodeLabel[][] = [];
  for (let index = 0; index < labels.length; index += 3) rows.push(labels.slice(index, index + 3));
  return (
    <div className="barcode-print-area labels w-[500px] bg-white text-black">
      <table className="w-full border-collapse text-center">
        <tbody>
          {rows.map((row) => (
            <tr key={row.map((label) => label.number).join("-")}>
              {row.map((label) => (
                <td
                  key={label.number}
                  className="w-1/3 break-inside-avoid px-2 py-2 align-top font-bold"
                >
                  <p className="text-xs">LADIES COLLECTION</p>
                  <BarcodeMark value={label.number} />
                  <p className="text-xs">{label.number}</p>
                  <p className="text-base font-bold">{stickerPrice(label.price)}</p>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
