import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Cell = string | number;

export function PrintTableButton({
  title,
  load,
  className,
}: {
  title: string;
  load: () => Promise<{ columns: string[]; rows: Cell[][] }>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function print() {
    setBusy(true);
    const popup = window.open("", "_blank");
    if (!popup) {
      toast.error("Allow pop-ups to print or save a PDF.");
      setBusy(false);
      return;
    }
    popup.document.write(
      "<!doctype html><title>Preparing printout…</title><p>Preparing printout…</p>",
    );
    popup.document.close();
    try {
      const sheet = await load();
      if (popup.closed) return;
      popup.document.open();
      popup.document.write(printDocument(title, sheet));
      popup.document.close();
      popup.focus();
      popup.print();
    } catch (error) {
      popup.close();
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

function printDocument(title: string, sheet: { columns: string[]; rows: Cell[][] }): string {
  const head = sheet.columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
  const body = sheet.rows
    .map(
      (row) =>
        `<tr>${sheet.columns.map((_, index) => `<td>${escapeHtml(String(row[index] ?? ""))}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;color:#222;margin:24px}h1{font-size:20px;margin:0 0 18px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#f4f4f4;white-space:nowrap}@page{margin:12mm}</style></head><body><h1>${escapeHtml(title)}</h1><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ??
      character,
  );
}
