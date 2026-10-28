import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { stockGap } from "../src/lib/reports";

type StockRow = {
  id: string;
  inventory_no: string;
  product_id: string;
  quantity: number | string;
  received_quantity: number | string;
};
type LineRow = { inventory_item_id: string | null; invoice_id: string; quantity: number | string };
type InvoiceRow = { id: string; status: string };

function envValue(file: string, name: string): string {
  const text = readFileSync(file, "utf8");
  const line = text.split("\n").find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "") ?? "";
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

async function main() {
  if (process.argv.includes("--apply")) throw new Error("This script only prints a proposal. It does not write.");
  const url = envValue(".env", "VITE_SUPABASE_URL") || envValue(".env", "SUPABASE_URL");
  const key = envValue(".env.local", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase URL or service role key.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const stock: StockRow[] = [];
  const lines: LineRow[] = [];
  const invoices: InvoiceRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, inventory_no, product_id, quantity, received_quantity")
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    stock.push(...((data ?? []) as StockRow[]));
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("invoice_lines").select("inventory_item_id, invoice_id, quantity").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    lines.push(...((data ?? []) as LineRow[]));
    if ((data ?? []).length < 1000) break;
  }
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("invoices").select("id, status").neq("status", "cancelled").order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    invoices.push(...((data ?? []) as InvoiceRow[]));
    if ((data ?? []).length < 1000) break;
  }

  const active = new Set(invoices.map((row) => row.id));
  const billed = new Map<string, number>();
  for (const line of lines) {
    if (!line.inventory_item_id || !active.has(line.invoice_id)) continue;
    billed.set(line.inventory_item_id, (billed.get(line.inventory_item_id) ?? 0) + Number(line.quantity));
  }

  const counts = {
    slips: stock.length,
    mismatch: 0,
    offShelfWithoutBill: 0,
    pieceReceived1Billed0OnHand0: 0,
    billedButStillOnShelf: 0,
    pieceReceived1Billed1OnHand1: 0,
    shortOfReceipt: 0,
  };
  let availableQuantity = 0;
  let availableSlips = 0;
  const proposal: { inventoryNo: string; from: number; to: number }[] = [];
  let worst: { inventoryNo: string; productId: string; received: number; billed: number; onHand: number; difference: number } | null = null;
  let oddOffShelf: { inventoryNo: string; received: number; billed: number; onHand: number; difference: number } | null = null;

  for (const row of stock) {
    const received = Number(row.received_quantity);
    const onHand = Number(row.quantity);
    const sold = round3(billed.get(row.id) ?? 0);
    if (onHand > 0) {
      availableSlips += 1;
      availableQuantity = round3(availableQuantity + onHand);
    }
    const difference = stockGap(received, onHand, sold);
    if (difference === 0) continue;
    counts.mismatch += 1;
    if (!worst || difference < worst.difference) {
      worst = { inventoryNo: row.inventory_no, productId: row.product_id, received, billed: sold, onHand, difference };
    }
    if (sold === 0 && onHand === 0 && received > 0) {
      counts.offShelfWithoutBill += 1;
      if (received === 1) counts.pieceReceived1Billed0OnHand0 += 1;
      else oddOffShelf = { inventoryNo: row.inventory_no, received, billed: sold, onHand, difference };
      continue;
    }
    if (difference > 0 && sold > 0) {
      counts.billedButStillOnShelf += 1;
      if (received === 1 && sold === 1 && onHand === 1) counts.pieceReceived1Billed1OnHand1 += 1;
      proposal.push({ inventoryNo: row.inventory_no, from: onHand, to: round3(Math.max(0, received - sold)) });
      continue;
    }
    counts.shortOfReceipt += 1;
  }

  let product: { code: string; name: string } | null = null;
  if (worst) {
    const { data } = await supabase.from("products").select("code, name").eq("id", worst.productId).maybeSingle();
    product = data ? { code: data.code, name: data.name } : null;
  }

  console.log(
    JSON.stringify(
      {
        mode: "dry-run",
        writes: 0,
        counts,
        availableSlips,
        availableQuantity,
        worst: worst ? { inventoryNo: worst.inventoryNo, code: product?.code ?? "", name: product?.name ?? "", received: worst.received, billed: worst.billed, onHand: worst.onHand, difference: worst.difference } : null,
        oddOffShelf,
        proposedShelfUpdates: proposal.length,
        sample: proposal.slice(0, 8),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Proposal failed.");
  process.exit(1);
});
