import type { ReactNode } from "react";
import { code128Widths } from "@/lib/barcode";
import { formatRupees } from "@/lib/products";

export type BarcodeLabel = { number: string; price: number; caption?: string };

const printStyle = `@media print { body * { visibility: hidden !important; } .labels, .labels * { visibility: visible !important; } .labels { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; } }`;

export function BarcodeMark({ value }: { value: string }) {
  const widths = code128Widths(value);
  if (!widths) return <span className="font-mono text-sm">{value}</span>;
  const quiet = 10;
  const height = 70;
  let x = quiet;
  const bars: ReactNode[] = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0)
      bars.push(<rect key={index} x={x} y={0} width={width} height={height} fill="black" />);
    x += width;
  });
  return (
    <svg
      viewBox={`0 0 ${x + quiet} ${height}`}
      className="h-16 w-full"
      role="img"
      aria-label={value}
    >
      {bars}
    </svg>
  );
}

export function LabelSheet({ labels }: { labels: BarcodeLabel[] }) {
  return (
    <div className="labels">
      <style>{printStyle}</style>
      <div className="grid grid-cols-2 gap-2 print:grid-cols-3">
        {labels.map((label) => (
          <div
            key={label.number}
            className="break-inside-avoid border border-black bg-white px-2 py-2 text-center text-black"
          >
            <p className="text-xs font-semibold">LADIES COLLECTION</p>
            {label.caption ? <p className="mb-2 text-xs">{label.caption}</p> : null}
            <BarcodeMark value={label.number} />
            <p className="mt-1 font-mono text-sm tracking-wide">{label.number}</p>
            <p className="text-sm font-semibold">{formatRupees(label.price)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
