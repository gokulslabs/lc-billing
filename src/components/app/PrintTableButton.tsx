import { useState } from "react";
import { toast } from "sonner";
import { LEGACY_PRINT_TITLE, escapePrint, printHtmlInSameTab } from "@/components/app/ShopSlip";
import { Button } from "@/components/ui/button";

type Cell = string | number;

export function PrintTableButton({
  title,
  load,
  className,
}: {
  title: string;
  load: () => Promise<{ columns: string[]; rows: Cell[][]; lines?: string[] }>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    try {
      const sheet = await load();
      if (!printHtmlInSameTab(printDocument(title, sheet))) {
        toast.error("Could not prepare the printout.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not prepare the printout.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className ?? "rounded-full"}
      onClick={() => void print()}
      disabled={busy}
    >
      {busy ? "Preparing…" : "Print / Save PDF"}
    </Button>
  );
}

function printDocument(
  title: string,
  sheet: { columns: string[]; rows: Cell[][]; lines?: string[] },
): string {
  const head = sheet.columns.map((column) => `<th>${escapePrint(column)}</th>`).join("");
  const body = sheet.rows
    .map(
      (row) =>
        `<tr>${sheet.columns.map((_, index) => `<td>${escapePrint(String(row[index] ?? ""))}</td>`).join("")}</tr>`,
    )
    .join("");
  const lines = (sheet.lines ?? [])
    .map((line) => `<p class="line">${escapePrint(line)}</p>`)
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${LEGACY_PRINT_TITLE}</title><style>body{font-family:Helvetica,Arial,sans-serif;color:#222;margin:24px}h1,h2{margin:0;text-align:center;font-weight:700}h1{font-size:18px}h2{margin-top:6px;font-size:14px}p.line{margin:10px 0 0;font-size:12px}table{border-collapse:collapse;width:100%;margin-top:14px;font-size:11px}th,td{border:1px solid #bbb;padding:5px;text-align:left;vertical-align:top}th{background:#f4f4f4;white-space:nowrap}@page{margin:12mm}</style></head><body><h1>LADIES COLLECTIONS</h1><h2>${escapePrint(title)}</h2>${lines}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}
