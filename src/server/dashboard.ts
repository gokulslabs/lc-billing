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
  const [invoices, payments, products, customers, employees, stitching] = await Promise.all([
    readAll<{ id: string }>((from, to) =>
      supabaseAdmin
        .from("invoices")
        .select("id")
        .eq("billed_on", today)
        .neq("status", "cancelled")
        .order("id")
        .range(from, to),
    ),
    readAll<{ amount: number | string }>((from, to) =>
      supabaseAdmin.from("payments").select("amount").eq("paid_on", today).order("id").range(from, to),
    ),
    supabaseAdmin.from("products").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("customers").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("employees").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("stitching_orders").select("id", { count: "exact", head: true }).in("status", ["PENDING", "READY"]),
  ]);
  if (!invoices || !payments || products.error || customers.error || employees.error || stitching.error) {
    return c.json({ error: "Could not load the dashboard." }, 500);
  }

  const invoiceIds = invoices.rows.map((row) => row.id);
  const lines = await readIn<{ quantity: number | string; amount: number | string }>(invoiceIds, (chunk, from, to) =>
    supabaseAdmin.from("invoice_lines").select("quantity, amount").in("invoice_id", chunk).order("id").range(from, to),
  );
  if (!lines) return c.json({ error: "Could not load today's sales." }, 500);

  const sales = sumSales(lines.map((row) => ({ quantity: Number(row.quantity), amount: Number(row.amount) })));
  const stats: DashboardStats = {
    salesAmount: sales.amount,
    salesQuantity: sales.quantity,
    collections: sumMoney(payments.rows.map((row) => Number(row.amount))),
    bills: invoiceIds.length,
    products: products.count ?? 0,
    customers: customers.count ?? 0,
    employees: employees.count ?? 0,
    openStitching: stitching.count ?? 0,
  };
  return c.json({ stats });
});

export { dashboard as dashboardRoutes };
