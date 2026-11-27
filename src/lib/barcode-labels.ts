import { code128Widths } from "@/lib/barcode";

export type BarcodeLabel = { number: string; price: number; caption?: string };

export function formatStickerPrice(price: number): string {
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
        `<div class="sticker-row">${row
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
            return `<section class="sticker"><p class="brand">LADIES COLLECTION</p>${barcode}<p class="number">${escapeHtml(label.number)}</p><p class="price">${escapeHtml(formatStickerPrice(label.price))}</p></section>`;
          })
          .join("")}</div>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Barcode labels</title><style>
    *{box-sizing:border-box} @page{margin:1mm} html,body{margin:0;padding:0;width:100%;background:#fff;color:#000;font-family:Arial,sans-serif}
    .sheet{width:100%}.sticker-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));width:100%;break-inside:avoid;page-break-inside:avoid;}
    .sticker{display:flex;min-width:0;flex-direction:column;align-items:center;justify-content:flex-start;padding:0 .4mm;text-align:center;font-weight:700;break-inside:avoid;page-break-inside:avoid;}
    p{margin:0;line-height:1}.brand,.number{font-size:7pt}.price{font-size:8pt} svg{display:block;flex:none;width:100%;height:4.8mm;fill:#000}
    @media print{.sticker-row,.sticker{break-inside:avoid;page-break-inside:avoid}}
  </style></head><body><main class="sheet">${body}</main></body></html>`;
}
