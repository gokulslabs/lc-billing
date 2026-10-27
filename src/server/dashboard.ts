import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sumMoney, sumSales, type DashboardStats } from "@/lib/dashboard";
import { shopToday } from "@/lib/sales";
import { requireShop } from "@/server/guard";
import { readAll, readIn } from "@/server/read-all";

type Env = { Variables: { userId: string } };

const dashboard = new Hono<Env>();
dashboard.use("*", requireShop);

dashboard.get("/", async (c) => {
  const today = shopToday();
  const [invoices, payments, openInvoices, ready, dueToday] = await Promise.all([
    readAll<{ id: string }>((from, to) =>
      supabaseAdmin
        .from("invoices")
        .select("id")
        .eq("billed_on", today)
        .neq("status", "cancelled")
        .order("id")
        .range(from, to),
    ),
    readAll<{ amount: number | string; mode: string | null }>((from, to) =>
      supabaseAdmin.from("payments").select("amount, mode").eq("paid_on", today).order("id").range(from, to),
    ),
    readAll<{ id: string }>((from, to) =>
      supabaseAdmin.from("invoices").select("id").eq("status", "open").order("id").range(from, to),
    ),
    supabaseAdmin.from("stitching_orders").select("id", { count: "exact", head: true }).eq("status", "READY"),
    supabaseAdmin
      .from("stitching_orders")
      .select("id", { count: "exact", head: true })
      .in("status", ["PENDING", "TRIAL"])
      .eq("delivery_on", today),
  ]);
  if (!invoices || !payments || !openInvoices || ready.error || dueToday.error) {
    return c.json({ error: "Could not load the dashboard." }, 500);
  }

  const invoiceIds = invoices.rows.map((row) => row.id);
  const openIds = openInvoices.rows.map((row) => row.id);
  const [lines, openLines, openPayments, todayPaymentsOnBills] = await Promise.all([
    readIn<{ quantity: number | string; amount: number | string }>(invoiceIds, (chunk, from, to) =>
      supabaseAdmin.from("invoice_lines").select("quantity, amount").in("invoice_id", chunk).order("id").range(from, to),
    ),
    readIn<{ invoice_id: string; amount: number | string }>(openIds, (chunk, from, to) =>
      supabaseAdmin.from("invoice_lines").select("invoice_id, amount").in("invoice_id", chunk).order("id").range(from, to),
    ),
    readIn<{ invoice_id: string; amount: number | string }>(openIds, (chunk, from, to) =>
      supabaseAdmin.from("payments").select("invoice_id, amount").in("invoice_id", chunk).order("id").range(from, to),
    ),
    readIn<{ invoice_id: string; amount: number | string }>(invoiceIds, (chunk, from, to) =>
      supabaseAdmin.from("payments").select("invoice_id, amount").in("invoice_id", chunk).order("id").range(from, to),
    ),
  ]);
  if (!lines || !openLines || !openPayments || !todayPaymentsOnBills) return c.json({ error: "Could not load today's sales." }, 500);

  const sales = sumSales(lines.map((row) => ({ quantity: Number(row.quantity), amount: Number(row.amount) })));
  const owed = sumByInvoice(openLines);
  const paid = sumByInvoice(openPayments);
  let unpaidBills = 0;
  let unpaidAmount = 0;
  for (const id of openIds) {
    const balance = Math.round(((owed.get(id) ?? 0) - (paid.get(id) ?? 0)) * 100) / 100;
    if (balance > 0.001) {
      unpaidBills += 1;
      unpaidAmount = Math.round((unpaidAmount + balance) * 100) / 100;
    }
  }
  const collectedOnToday = sumMoney(todayPaymentsOnBills.map((row) => Number(row.amount)));
  const modeAmount = (mode: string) =>
    sumMoney(payments.rows.filter((row) => row.mode === mode).map((row) => Number(row.amount)));
  const stats: DashboardStats = {
    salesAmount: sales.amount,
    collections: sumMoney(payments.rows.map((row) => Number(row.amount))),
    dueOnToday: Math.max(0, Math.round((sales.amount - collectedOnToday) * 100) / 100),
    unpaidBills,
    unpaidAmount,
    readyStitching: ready.count ?? 0,
    dueTodayStitching: dueToday.count ?? 0,
    cash: modeAmount("CASH"),
    upi: modeAmount("UPI"),
    card: modeAmount("CARD"),
  };
  return c.json({ stats });
});

function sumByInvoice(rows: { invoice_id: string; amount: number | string }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.invoice_id, Math.round(((totals.get(row.invoice_id) ?? 0) + Number(row.amount)) * 100) / 100);
  }
  return totals;
}

export { dashboard as dashboardRoutes };
