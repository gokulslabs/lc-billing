import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  blankToNull,
  customerSchema,
  zodMessage,
  type Customer,
  type CustomerBill,
  type CustomerOrder,
} from "@/lib/customers";
import { pageRange, readPage } from "@/lib/paging";
import { requireShop } from "@/server/guard";
import { readAll, readIn } from "@/server/read-all";

type Env = { Variables: { userId: string } };

type CustomerRow = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  book_no: string | null;
};

const customers = new Hono<Env>();
customers.use("*", requireShop);

customers.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const safe = q.replace(/[%_,]/g, "");
  const page = readPage(c.req.query("page"));
  const { from, to } = pageRange(page);
  const ranked = supabaseAdmin.from("customers").select("id, name, address, phone, book_no", { count: "exact" }).order("name").order("id");
  const filtered = safe ? ranked.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,book_no.ilike.%${safe}%`) : ranked;
  const { data, error, count } = await filtered.range(from, to);
  if (error) return c.json({ error: "Could not load customers." }, 500);
  return c.json({ customers: ((data ?? []) as CustomerRow[]).map(toCustomer), total: count ?? 0, page });
});

customers.get("/:id/history", async (c) => {
  const id = c.req.param("id");
  const billPage = readPage(c.req.query("billsPage"));
  const orderPage = readPage(c.req.query("ordersPage"));
  const { data, error } = await supabaseAdmin.from("customers").select("id, name, address, phone, book_no").eq("id", id).maybeSingle();
  if (error) return c.json({ error: "Could not load this customer." }, 500);
  if (!data) return c.json({ error: "Customer not found." }, 404);

  const billsRange = pageRange(billPage);
  const ordersRange = pageRange(orderPage);
  const [bills, orders, totals] = await Promise.all([
    supabaseAdmin
      .from("invoices")
      .select("id, bill_no, billed_on, status", { count: "exact" })
      .eq("customer_id", id)
      .order("billed_on", { ascending: false })
      .order("id", { ascending: false })
      .range(billsRange.from, billsRange.to),
    supabaseAdmin
      .from("stitching_orders")
      .select("id, order_no, bag_no, stitching_product_id, ordered_on, delivery_on, status, amount", { count: "exact" })
      .eq("customer_id", id)
      .order("ordered_on", { ascending: false })
      .order("id", { ascending: false })
      .range(ordersRange.from, ordersRange.to),
    customerTotals(id),
  ]);
  if (bills.error || orders.error || !totals) return c.json({ error: "Could not load this customer's history." }, 500);

  const billRows = (bills.data ?? []) as BillRow[];
  const orderRows = (orders.data ?? []) as OrderRow[];
  const detailed = await billDetails(billRows);
  const garments = await garmentNames(orderRows.map((row) => row.stitching_product_id));
  if (!detailed || !garments) return c.json({ error: "Could not load this customer's history." }, 500);

  return c.json({
    customer: toCustomer(data as CustomerRow),
    bills: billRows.map((row) => detailed.get(row.id) ?? emptyBill(row)),
    billTotal: bills.count ?? billRows.length,
    billPage,
    billed: totals.billed,
    collected: totals.collected,
    orders: orderRows.map((row) => toOrder(row, garments.get(row.stitching_product_id ?? "") ?? "")),
    orderTotal: orders.count ?? orderRows.length,
    orderPage,
  });
});

customers.post("/", async (c) => {
  const parsed = customerSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert(toRow(parsed.data))
    .select("id, name, address, phone, book_no")
    .single();
  if (error || !data) return c.json({ error: "Could not save the customer." }, 500);
  return c.json({ customer: toCustomer(data as CustomerRow) }, 201);
});

customers.patch("/:id", async (c) => {
  const parsed = customerSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const { data, error } = await supabaseAdmin
    .from("customers")
    .update(toRow(parsed.data))
    .eq("id", c.req.param("id"))
    .select("id, name, address, phone, book_no")
    .maybeSingle();
  if (error) return c.json({ error: "Could not update the customer." }, 500);
  if (!data) return c.json({ error: "Customer not found." }, 404);
  return c.json({ customer: toCustomer(data as CustomerRow) });
});

customers.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const [bills, orders] = await Promise.all([
    supabaseAdmin.from("invoices").select("id", { count: "exact", head: true }).eq("customer_id", id),
    supabaseAdmin.from("stitching_orders").select("id", { count: "exact", head: true }).eq("customer_id", id),
  ]);
  if (bills.error || orders.error) return c.json({ error: "Could not check this customer." }, 500);
  if ((bills.count ?? 0) > 0 || (orders.count ?? 0) > 0) {
    return c.json({ error: "This customer has bills or stitching orders." }, 400);
  }
  const { error } = await supabaseAdmin.from("customers").delete().eq("id", id);
  if (error) return c.json({ error: "Could not remove the customer." }, 500);
  return c.json({ ok: true });
});

function toRow(input: { name: string; address: string; phone: string; bookNo: string }) {
  return {
    name: input.name,
    address: blankToNull(input.address),
    phone: blankToNull(input.phone),
    book_no: blankToNull(input.bookNo),
  };
}

type BillRow = { id: string; bill_no: string; billed_on: string; status: string };
type OrderRow = {
  id: string;
  order_no: string;
  bag_no: string | null;
  stitching_product_id: string | null;
  ordered_on: string;
  delivery_on: string | null;
  status: string;
  amount: number | string;
};
type LineRow = {
  invoice_id: string;
  inventory_no: string;
  product_id: string;
  quantity: number | string;
  amount: number | string;
};
type PaymentRow = { invoice_id: string; paid_on: string; amount: number | string; mode: string | null };

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    phone: row.phone,
    bookNo: row.book_no,
  };
}

async function customerTotals(customerId: string): Promise<{ billed: number; collected: number } | null> {
  const loaded = await readAll<{ id: string }>((from, to) =>
    supabaseAdmin.from("invoices").select("id").eq("customer_id", customerId).order("id").range(from, to),
  );
  if (!loaded) return null;
  const ids = loaded.rows.map((row) => row.id);
  if (ids.length === 0) return { billed: 0, collected: 0 };
  const [lines, payments] = await Promise.all([
    readIn<{ amount: number | string }>(ids, (chunk, from, to) =>
      supabaseAdmin.from("invoice_lines").select("amount").in("invoice_id", chunk).order("id").range(from, to),
    ),
    readIn<{ amount: number | string }>(ids, (chunk, from, to) =>
      supabaseAdmin.from("payments").select("amount").in("invoice_id", chunk).order("id").range(from, to),
    ),
  ]);
  if (!lines || !payments) return null;
  return {
    billed: round2(lines.reduce((sum, row) => sum + Number(row.amount), 0)),
    collected: round2(payments.reduce((sum, row) => sum + Number(row.amount), 0)),
  };
}

async function billDetails(rows: BillRow[]): Promise<Map<string, CustomerBill> | null> {
  const bills = new Map<string, CustomerBill>();
  for (const row of rows) bills.set(row.id, emptyBill(row));
  if (rows.length === 0) return bills;
  const ids = rows.map((row) => row.id);
  const [lines, payments] = await Promise.all([
    readIn<LineRow>(ids, (chunk, from, to) =>
      supabaseAdmin
        .from("invoice_lines")
        .select("invoice_id, inventory_no, product_id, quantity, amount")
        .in("invoice_id", chunk)
        .order("id")
        .range(from, to),
    ),
    readIn<PaymentRow>(ids, (chunk, from, to) =>
      supabaseAdmin.from("payments").select("invoice_id, paid_on, amount, mode").in("invoice_id", chunk).order("paid_on").range(from, to),
    ),
  ]);
  if (!lines || !payments) return null;
  const names = await productNames(lines.map((row) => row.product_id));
  if (!names) return null;
  for (const line of lines) {
    const bill = bills.get(line.invoice_id);
    if (!bill) continue;
    const amount = round2(Number(line.amount));
    bill.lines.push({
      inventoryNo: line.inventory_no,
      productName: names.get(line.product_id) ?? "",
      quantity: Number(line.quantity),
      amount,
    });
    bill.total = round2(bill.total + amount);
  }
  for (const payment of payments) {
    const bill = bills.get(payment.invoice_id);
    if (!bill) continue;
    const amount = round2(Number(payment.amount));
    bill.payments.push({ paidOn: payment.paid_on, amount, mode: payment.mode ?? null });
    bill.collected = round2(bill.collected + amount);
  }
  for (const bill of bills.values()) bill.balance = round2(bill.total - bill.collected);
  return bills;
}

async function productNames(ids: string[]): Promise<Map<string, string> | null> {
  const names = new Map<string, string>();
  const rows = await readIn<{ id: string; name: string }>(ids, (chunk, from, to) =>
    supabaseAdmin.from("products").select("id, name").in("id", chunk).order("id").range(from, to),
  );
  if (!rows) return null;
  for (const row of rows) names.set(row.id, row.name);
  return names;
}

async function garmentNames(ids: (string | null)[]): Promise<Map<string, string> | null> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data, error } = await supabaseAdmin.from("stitching_products").select("id, name").in("id", unique);
  if (error) return null;
  for (const row of (data ?? []) as { id: string; name: string }[]) names.set(row.id, row.name);
  return names;
}

function emptyBill(row: BillRow): CustomerBill {
  return {
    id: row.id,
    billNo: row.bill_no,
    billedOn: row.billed_on,
    status: row.status,
    total: 0,
    collected: 0,
    balance: 0,
    lines: [],
    payments: [],
  };
}

function toOrder(row: OrderRow, garment: string): CustomerOrder {
  return {
    id: row.id,
    orderNo: row.order_no,
    garment,
    bagNo: row.bag_no,
    orderedOn: row.ordered_on,
    deliveryOn: row.delivery_on,
    status: row.status,
    amount: round2(Number(row.amount)),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export { customers as customerRoutes };
