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
    <div className="barcode-print-area labels w-[500px] bg-white text-black">
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
