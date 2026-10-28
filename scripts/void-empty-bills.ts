import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

type InvoiceRow = { id: string; bill_no: string; status: string; remarks: string | null };

const apply = process.argv.includes("--apply");

function envValue(file: string, name: string): string {
  const text = readFileSync(file, "utf8");
  const line = text.split("\n").find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "") ?? "";
}

async function main() {
  const url = envValue(".env", "VITE_SUPABASE_URL") || envValue(".env", "SUPABASE_URL");
  const key = envValue(".env.local", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase URL or service role key.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const invoices: InvoiceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, bill_no, status, remarks")
      .neq("status", "cancelled")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    invoices.push(...((data ?? []) as InvoiceRow[]));
    if ((data ?? []).length < 1000) break;
  }

  const withLines = new Set<string>();
  const withPayments = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("invoice_lines").select("invoice_id").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) withLines.add(row.invoice_id);
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("payments").select("invoice_id").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) withPayments.add(row.invoice_id);
    if ((data ?? []).length < 1000) break;
  }

  const empty = invoices.filter((row) => !withLines.has(row.id) && !withPayments.has(row.id));
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        bills: invoices.length,
        empty: empty.length,
        byStatus: empty.reduce<Record<string, number>>((counts, row) => {
          counts[row.status] = (counts[row.status] ?? 0) + 1;
          return counts;
        }, {}),
        billNos: empty.map((row) => row.bill_no),
      },
      null,
      2,
    ),
  );
  if (!apply) return;
  if (process.env.BACKUP_CONFIRMED !== "1") throw new Error("Refusing to write. Set BACKUP_CONFIRMED=1 after a database backup.");
  for (const row of empty) {
    const remarks = row.remarks?.trim() ? row.remarks : "Voided empty bill — no lines.";
    const { error } = await supabase
      .from("invoices")
      .update({ status: "cancelled", remarks })
      .eq("id", row.id)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
  }
  console.log(JSON.stringify({ applied: empty.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Void failed.");
  process.exit(1);
});
