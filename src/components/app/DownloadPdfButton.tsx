import { useState } from "react";
import { toast } from "sonner";
import { LEGACY_PRINT_TITLE } from "@/components/app/ShopSlip";
import { Button } from "@/components/ui/button";

type PdfTable = { columns: string[]; rows: (string | number)[][] };

export async function createTablePdf(title: string, table: PdfTable) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF({ format: "a4", unit: "pt", compress: true });
  const pageCount = "{total_pages_count_string}";
  document.setProperties({ title: LEGACY_PRINT_TITLE });
  autoTable(document, {
    head: [table.columns],
    body: table.rows,
    margin: { top: 72, right: 36, bottom: 36, left: 36 },
    styles: { fontSize: 9, overflow: "linebreak" },
    rowPageBreak: "avoid",
    willDrawPage: () => {
      const width = document.internal.pageSize.getWidth();
      document.setTextColor(0);
      document.setFont("helvetica", "bold");
      document.setFontSize(14);
      document.text("LADIES COLLECTIONS", width / 2, 28, { align: "center" });
      document.setFontSize(12);
      document.text(title, width / 2, 46, { align: "center" });
    },
    didDrawPage: () => {
      const width = document.internal.pageSize.getWidth();
      const height = document.internal.pageSize.getHeight();
      const page = document.getCurrentPageInfo().pageNumber;
      document.setFont("helvetica", "normal");
      document.setFontSize(9);
      document.text(`Page ${page}/${pageCount}`, width / 2, height - 18, { align: "center" });
    },
  });
  document.putTotalPages(pageCount);
  return document;
}

export function DownloadPdfButton({
  filename,
  title,
  load,
}: {
  filename: string;
  title: string;
  load: () => Promise<PdfTable>;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const document = await createTablePdf(title, await load());
      document.save(filename);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not download the PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="rounded-full"
      disabled={busy}
      onClick={() => void download()}
    >
      {busy ? "Preparing…" : "Download PDF"}
    </Button>
  );
}
