import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { paymentStatus } from "../src/lib/sales";

type InvoiceRow = { id: string; status: string; bill_no: string };
type MoneyRow = { invoice_id: string; amount: number | string };

const apply = process.argv.includes("--apply");

function envValue(file: string, name: string): string {
  const text = readFileSync(file, "utf8");
  const line = text.split("\n").find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "") ?? "";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
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
      .select("id, bill_no, status")
      .neq("status", "cancelled")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    invoices.push(...((data ?? []) as InvoiceRow[]));
    if ((data ?? []).length < 1000) break;
  }

  const nets = new Map<string, number>();
  const collected = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("invoice_lines").select("invoice_id, amount").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as MoneyRow[]) nets.set(row.invoice_id, round2((nets.get(row.invoice_id) ?? 0) + Number(row.amount)));
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("payments").select("invoice_id, amount").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as MoneyRow[]) {
      collected.set(row.invoice_id, round2((collected.get(row.invoice_id) ?? 0) + Number(row.amount)));
    }
    if ((data ?? []).length < 1000) break;
  }

  const counts = { open: 0, partial: 0, paid: 0, unchanged: 0 };
  const changes: { id: string; billNo: string; from: string; to: "open" | "partial" | "paid"; net: number; collected: number }[] = [];
  for (const invoice of invoices) {
    const net = nets.get(invoice.id) ?? 0;
    const paid = collected.get(invoice.id) ?? 0;
    const next = paymentStatus(net, paid, invoice.status);
    if (next === "cancelled") continue;
    counts[next] += 1;
    if (next === invoice.status) counts.unchanged += 1;
    else changes.push({ id: invoice.id, billNo: invoice.bill_no, from: invoice.status, to: next, net, collected: paid });
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", bills: invoices.length, counts, changes }, null, 2));
  if (!apply) return;
  if (process.env.BACKUP_CONFIRMED !== "1") throw new Error("Refusing to write. Set BACKUP_CONFIRMED=1 after a database backup.");
  for (const change of changes) {
    const { error } = await supabase.from("invoices").update({ status: change.to }).eq("id", change.id).neq("status", "cancelled");
    if (error) throw new Error(error.message);
  }
  console.log(JSON.stringify({ applied: changes.length }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Backfill failed.");
  process.exit(1);
});
