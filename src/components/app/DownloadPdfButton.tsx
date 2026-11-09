import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type PdfTable = { columns: string[]; rows: (string | number)[][] };

export async function createTablePdf(title: string, table: PdfTable) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const document = new jsPDF({ format: "a4", unit: "pt", compress: true });
  document.setProperties({ title });
  autoTable(document, {
    head: [table.columns],
    body: table.rows,
    margin: { top: 58, right: 36, bottom: 36, left: 36 },
    styles: { fontSize: 9, overflow: "linebreak" },
    rowPageBreak: "avoid",
    willDrawPage: () => {
      document.setFontSize(15);
      document.setTextColor(0);
      document.text(title, 36, 37);
    },
  });
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
