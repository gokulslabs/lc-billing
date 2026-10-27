import type { ReactNode } from "react";
import { code128Widths } from "@/lib/barcode";

const printStyle = `@media print { body * { visibility: hidden !important; } .labels, .labels * { visibility: visible !important; } .labels { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; } }`;

export function BarcodeMark({ value }: { value: string }) {
  const widths = code128Widths(value);
  if (!widths) return <span className="font-mono text-sm">{value}</span>;
  const quiet = 10;
  const height = 70;
  let x = quiet;
  const bars: ReactNode[] = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push(<rect key={index} x={x} y={0} width={width} height={height} fill="black" />);
    x += width;
  });
  return (
    <svg viewBox={`0 0 ${x + quiet} ${height}`} className="h-16 w-full" role="img" aria-label={value}>
      {bars}
    </svg>
  );
}

export function LabelSheet({ labels }: { labels: { number: string; caption: string }[] }) {
  return (
    <div className="labels">
      <style>{printStyle}</style>
      <div className="grid grid-cols-2 gap-4">
        {labels.map((label) => (
          <div key={`${label.number}-${label.caption}`} className="break-inside-avoid rounded-xl border border-black bg-white px-3 py-4 text-center text-black">
            {label.caption ? <p className="mb-2 text-xs">{label.caption}</p> : null}
            <BarcodeMark value={label.number} />
            <p className="mt-1 font-mono text-sm tracking-wide">{label.number}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
