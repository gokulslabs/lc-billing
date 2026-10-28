import { useState } from "react";
import { toast } from "sonner";
import { downloadExcel, type ExcelSheet } from "@/lib/excel";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function ExportExcelButton({
  filename,
  load,
  label = "Export Excel",
  className,
}: {
  filename: string;
  load: () => Promise<ExcelSheet[]>;
  label?: string;
  className?: string;
}) {
  const admin = useIsAdmin();
  const [busy, setBusy] = useState(false);
  if (!admin) return null;
  return (
    <Button
      type="button"
      variant="outline"
      className={cn("rounded-full", className)}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        Promise.resolve()
          .then(load)
          .then((sheets) => downloadExcel(filename, sheets))
          .catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : "Could not export.");
          })
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Preparing…" : label}
    </Button>
  );
}
