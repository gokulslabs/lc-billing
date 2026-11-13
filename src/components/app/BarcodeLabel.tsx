import type { ReactNode } from "react";
import { code128Widths } from "@/lib/barcode";

export type BarcodeLabel = { number: string; price: number; caption?: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
  );
}

function barcodeSvg(value: string): string {
  const widths = code128Widths(value);
  if (!widths) return `<span>${escapeHtml(value)}</span>`;
  const height = 30;
  let x = 0;
  const bars = widths.flatMap((width, index) => {
    const bar = index % 2 === 0 ? `<rect x="${x}" y="0" width="${width}" height="${height}"/>` : "";
    x += width;
    return bar;
  }).join("");
  return `<svg viewBox="0 0 ${x} ${height}" role="img" aria-label="${escapeHtml(value)}">${bars}</svg>`;
}

export function openBarcodePrintWindow(): Window | null {
  const popup = window.open("", "_blank");
  if (!popup) return null;
  popup.document.open();
  popup.document.write("<!doctype html><html><head><title>Barcode labels</title></head><body>Preparing barcode labels…</body></html>");
  popup.document.close();
  return popup;
}

export function printBarcodeLabels(popup: Window, labels: BarcodeLabel[]): void {
  const cells = labels.map(({ number, price }) => {
    const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
    return `<td><div class="brand">LADIES COLLECTION</div>${barcodeSvg(number)}<div class="number">${escapeHtml(number)}</div><div class="price">₹ ${amount}</div></td>`;
  });
  const rows: string[] = [];
  for (let index = 0; index < cells.length; index += 3) {
    rows.push(`<tr>${cells.slice(index, index + 3).join("")}</tr>`);
  }
  popup.document.open();
  popup.addEventListener("load", () => {
    popup.focus();
    popup.print();
  }, { once: true });
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Barcode labels</title><style>
    @page { margin: 5mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; color: #000; background: #fff; font-family: Arial, sans-serif; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { width: 33.333%; padding: 2mm 1mm; text-align: center; vertical-align: top; break-inside: avoid; }
    .brand { margin-bottom: 1mm; font-size: 8pt; font-weight: 700; }
    svg { display: block; width: 100%; height: 8mm; }
    .number { margin-top: 1mm; font-size: 8pt; font-weight: 700; }
    .price { margin-top: 1mm; font-size: 10pt; font-weight: 700; }
    tr { break-inside: avoid; }
  </style></head><body><table><tbody>${rows.join("")}</tbody></table></body></html>`);
  popup.document.close();
}

export function BarcodeMark({ value }: { value: string }) {
  const widths = code128Widths(value);
  if (!widths) return <span className="text-xs">{value}</span>;
  const height = 30;
  let x = 0;
  const bars: ReactNode[] = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push(<rect key={index} x={x} y={0} width={width} height={height} fill="black" />);
    x += width;
  });
  return (
    <svg viewBox={`0 0 ${x} ${height}`} width={x} height={height} role="img" aria-label={value} className="mx-auto">
      {bars}
    </svg>
  );
}

function stickerPrice(price: number): string {
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  return `₹ ${amount}`;
}

export function LabelSheet({ labels }: { labels: BarcodeLabel[] }) {
  const rows: BarcodeLabel[][] = [];
  for (let index = 0; index < labels.length; index += 3) rows.push(labels.slice(index, index + 3));
  return (
    <div className="labels w-[500px] bg-white text-black">
      <table className="w-full border-collapse text-center">
        <tbody>
          {rows.map((row) => (
            <tr key={row.map((label) => label.number).join("-")}>
              {row.map((label) => (
                <td key={label.number} className="w-1/3 break-inside-avoid px-2 py-2 align-top font-bold">
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
