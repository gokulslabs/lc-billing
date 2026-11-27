import type { ReactNode } from "react";
import { formatStickerPrice, type BarcodeLabel } from "@/lib/barcode-labels";
import { code128Widths } from "@/lib/barcode";

export type { BarcodeLabel } from "@/lib/barcode-labels";

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

export function LabelSheet({ labels }: { labels: BarcodeLabel[] }) {
  const rows: BarcodeLabel[][] = [];
  for (let index = 0; index < labels.length; index += 3) rows.push(labels.slice(index, index + 3));
  return (
    <div className="barcode-print-area labels w-full max-w-[500px] bg-white text-black">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-3 break-inside-avoid text-center">
          {row.map((label, columnIndex) => (
            <section
              key={columnIndex}
              className="flex min-w-0 flex-col items-center px-0.5 font-bold break-inside-avoid"
            >
              <p className="m-0 text-[7pt] leading-none">LADIES COLLECTION</p>
              <BarcodeMark value={label.number} />
              <p className="m-0 text-[7pt] leading-none">{label.number}</p>
              <p className="m-0 text-[8pt] leading-none">{formatStickerPrice(label.price)}</p>
            </section>
          ))}
        </div>
      ))}
    </div>
  );
}
