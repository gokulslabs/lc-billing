import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { blankToNull } from "@/lib/customers";
import { quantityForUnit } from "@/lib/inventory";
import type { Unit } from "@/lib/products";
import {
  cancelInvoiceSchema,
  collectionProblem,
  createInvoiceSchema,
  invoiceLineSchema,
  lineAmount,
  nextBillNo,
  paymentSchema,
  shopToday,
  zodMessage,
  type InvoiceDetail,
  type InvoiceItem,
  type InvoiceLine,
  type InvoicePayment,
  type InvoiceSummary,
} from "@/lib/sales";
import { pageRange, readPage } from "@/lib/paging";
import { requireShop } from "@/server/guard";
import { readAll, readIn } from "@/server/read-all";

type Env = { Variables: { userId: string } };

type InvoiceRow = {
  id: string;
  bill_no: string;
  customer_id: string;
  billed_on: string;
  status: string;
  remarks: string | null;
};

type LineRow = {
  id: string;
  invoice_id: string;
  inventory_item_id: string | null;
  product_id: string;
  inventory_no: string;
  quantity: number | string;
  rate: number | string;
  amount: number | string;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  amount: number | string;
  paid_on: string;
  showroom: string | null;
};

type StockRow = {
  id: string;
  inventory_no: string;
  product_id: string;
  quantity: number | string;
  status: string;
};

type ProductInfo = {
  id: string;
  code: string;
  name: string;
  unit: Unit;
  price: number;
  groupName: string;
};

const sales = new Hono<Env>();
sales.use("*", requireShop);

sales.get("/items", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const invoices = await loadInvoices(range.from, range.to, q, readPage(c.req.query("page")));
  if ("error" in invoices) return c.json({ error: invoices.error }, 500);
  if (invoices.rows.length === 0) return c.json({ items: [], total: 0 });
  const byId = new Map(invoices.rows.map((row) => [row.id, row]));
  const data = await readIn<LineRow>([...byId.keys()], (chunk, from, to) =>
    supabaseAdmin
      .from("invoice_lines")
      .select("id, invoice_id, inventory_item_id, product_id, inventory_no, quantity, rate, amount")
      .in("invoice_id", chunk)
      .order("id")
      .range(from, to),
  );
  if (!data) return c.json({ error: "Could not load bill lines." }, 500);
  const products = await loadProducts(((data ?? []) as LineRow[]).map((row) => row.product_id));
  if (!products) return c.json({ error: "Could not load products." }, 500);
  const names = await customerNames(invoices.rows.map((row) => row.customer_id));
  if (!names) return c.json({ error: "Could not load customers." }, 500);
  const items = data.flatMap((row) => {
    const invoice = byId.get(row.invoice_id);
    const product = products.get(row.product_id);
    if (!invoice || !product) return [];
    const item: InvoiceItem = {
      id: row.id,
      billNo: invoice.bill_no,
      billedOn: invoice.billed_on,
      customerName: names.get(invoice.customer_id) ?? "",
      inventoryNo: row.inventory_no,
      productCode: product.code,
      groupName: product.groupName,
      productName: product.name,
      quantity: Number(row.quantity),
      rate: Number(row.rate),
      amount: Number(row.amount),
    };
    return [item];
  });
  return c.json({ items, total: items.length });
});

sales.get("/preview", async (c) => {
  const inventoryNo = (c.req.query("inventoryNo") ?? "").trim();
  if (!inventoryNo) return c.json({ error: "Enter an inventory number." }, 400);
  const stock = await findStock(inventoryNo);
  if (!stock) return c.json({ error: "Inventory number not found." }, 404);
  const products = await loadProducts([stock.product_id]);
  const product = products?.get(stock.product_id);
  if (!product) return c.json({ error: "Could not load this product." }, 500);
  return c.json({
    preview: {
      inventoryNo: stock.inventory_no,
      productCode: product.code,
      groupName: product.groupName,
      productName: product.name,
      unit: product.unit,
      rate: product.price,
      status: stock.status,
      available: Number(stock.quantity),
    },
  });
});

sales.get("/", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const loaded = await loadInvoices(range.from, range.to, q, readPage(c.req.query("page")));
  if ("error" in loaded) return c.json({ error: loaded.error }, 500);
  const summaries = await summarize(loaded.rows);
  if ("error" in summaries) return c.json({ error: summaries.error }, 500);
  return c.json({ invoices: summaries.invoices, total: loaded.total, page: loaded.page });
});

sales.post("/", async (c) => {
  const parsed = createInvoiceSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const customer = await supabaseAdmin.from("customers").select("id, name").eq("id", parsed.data.customerId).maybeSingle();
  if (customer.error) return c.json({ error: "Could not check the customer." }, 500);
  if (!customer.data) return c.json({ error: "Choose a customer." }, 400);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const billNo = await allocateBillNo();
    if (!billNo) return c.json({ error: "Could not choose a bill number." }, 500);
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .insert({
        bill_no: billNo,
        customer_id: customer.data.id,
        billed_on: shopToday(),
        status: "open",
      })
      .select("id, bill_no, customer_id, billed_on, status, remarks")
      .single();
    if (isDuplicate(error) && attempt === 0) continue;
    if (error || !data) return c.json({ error: "Could not open the bill." }, 500);
    return c.json({ invoice: emptyDetail(data as InvoiceRow, customer.data.name) }, 201);
  }
  return c.json({ error: "Could not open the bill." }, 500);
});

sales.get("/:id", async (c) => {
  const detail = await loadDetail(c.req.param("id"));
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/lines", async (c) => {
  const parsed = invoiceLineSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  if (invoice.status !== "open") return c.json({ error: "This bill is cancelled." }, 400);

  const stock = await findStock(parsed.data.inventoryNo);
  if (!stock) return c.json({ error: "Inventory number not found." }, 400);
  const products = await loadProducts([stock.product_id]);
  const product = products?.get(stock.product_id);
  if (!product) return c.json({ error: "Could not load this product." }, 500);
  const quantityError = quantityForUnit(product.unit, parsed.data.quantity);
  if (quantityError) return c.json({ error: quantityError }, 400);
  const available = Number(stock.quantity);
  if (parsed.data.quantity > available + 0.0001) return c.json({ error: "Not enough stock on this inventory number." }, 400);

  const left = round3(available - parsed.data.quantity);
  const moved = await supabaseAdmin
    .from("inventory_items")
    .update({ quantity: left, status: left > 0 ? "available" : "sold" })
    .eq("id", stock.id)
    .eq("quantity", available)
    .select("id")
    .maybeSingle();
  if (moved.error || !moved.data) return c.json({ error: "Stock changed. Try the line again." }, 409);

  const amount = lineAmount(parsed.data.quantity, product.price);
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .insert({
      invoice_id: invoice.id,
      inventory_item_id: stock.id,
      product_id: product.id,
      inventory_no: stock.inventory_no,
      quantity: parsed.data.quantity,
      rate: product.price,
      amount,
    })
    .select("id, invoice_id, inventory_item_id, product_id, inventory_no, quantity, rate, amount")
    .single();
  if (error || !data) {
    await supabaseAdmin
      .from("inventory_items")
      .update({ quantity: available, status: stock.status })
      .eq("id", stock.id);
    return c.json({ error: "Could not add the line." }, 500);
  }
  const detail = await loadDetail(invoice.id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice, line: toLine(data as LineRow, product, left > 0 ? "available" : "sold") }, 201);
});

sales.delete("/:id/lines/:lineId", async (c) => {
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  if (invoice.status !== "open") return c.json({ error: "This bill is cancelled." }, 400);
  const line = await supabaseAdmin
    .from("invoice_lines")
    .select("id, invoice_id, inventory_item_id, product_id, inventory_no, quantity, rate, amount")
    .eq("id", c.req.param("lineId"))
    .eq("invoice_id", invoice.id)
    .maybeSingle();
  if (line.error) return c.json({ error: "Could not check this line." }, 500);
  if (!line.data) return c.json({ error: "Line not found." }, 404);
  const row = line.data as LineRow;
  if (row.inventory_item_id) {
    const restored = await restoreStock(row.inventory_item_id, Number(row.quantity));
    if (!restored) return c.json({ error: "Could not return this quantity to stock." }, 500);
  }
  const removed = await supabaseAdmin.from("invoice_lines").delete().eq("id", row.id);
  if (removed.error) return c.json({ error: "Could not remove the line." }, 500);
  const detail = await loadDetail(invoice.id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/cancel", async (c) => {
  const parsed = cancelInvoiceSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  if (invoice.status !== "open") return c.json({ error: "This bill is already cancelled." }, 400);
  const lines = await supabaseAdmin
    .from("invoice_lines")
    .select("id, inventory_item_id, quantity")
    .eq("invoice_id", invoice.id);
  if (lines.error) return c.json({ error: "Could not check the bill lines." }, 500);
  for (const line of lines.data ?? []) {
    if (!line.inventory_item_id) continue;
    const restored = await restoreStock(line.inventory_item_id, Number(line.quantity));
    if (!restored) return c.json({ error: "Could not return stock for this bill." }, 500);
  }
  const { error } = await supabaseAdmin
    .from("invoices")
    .update({ status: "cancelled", remarks: parsed.data.remarks })
    .eq("id", invoice.id)
    .eq("status", "open");
  if (error) return c.json({ error: "Could not cancel the bill." }, 500);
  const detail = await loadDetail(invoice.id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/payments", async (c) => {
  const parsed = paymentSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const detail = await loadDetail(c.req.param("id"));
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  if (detail.invoice.status !== "open") return c.json({ error: "This bill is cancelled." }, 400);
  const problem = collectionProblem(detail.invoice.balance, parsed.data.amount);
  if (problem) return c.json({ error: problem }, 400);
  const { error } = await supabaseAdmin.from("payments").insert({
    invoice_id: detail.invoice.id,
    amount: round2(parsed.data.amount),
    paid_on: parsed.data.paidOn,
    showroom: blankToNull(parsed.data.showroom),
  });
  if (error) return c.json({ error: "Could not save the collection." }, 500);
  const next = await loadDetail(detail.invoice.id);
  if ("error" in next) return c.json({ error: next.error }, next.status);
  return c.json({ invoice: next.invoice }, 201);
});

sales.delete("/:id", async (c) => {
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  if (invoice.status !== "open") return c.json({ error: "A cancelled bill stays on record." }, 400);
  const [lines, payments] = await Promise.all([
    supabaseAdmin.from("invoice_lines").select("id", { count: "exact", head: true }).eq("invoice_id", invoice.id),
    supabaseAdmin.from("payments").select("id", { count: "exact", head: true }).eq("invoice_id", invoice.id),
  ]);
  if (lines.error || payments.error) return c.json({ error: "Could not check this bill." }, 500);
  if ((lines.count ?? 0) > 0 || (payments.count ?? 0) > 0) {
    return c.json({ error: "Cancel the bill instead. It already has lines or a collection." }, 400);
  }
  const { error } = await supabaseAdmin.from("invoices").delete().eq("id", invoice.id);
  if (error) return c.json({ error: "Could not remove the bill." }, 500);
  return c.json({ ok: true });
});

async function loadInvoices(
  from: string | null,
  to: string | null,
  q: string,
  page: number,
): Promise<{ rows: InvoiceRow[]; total: number; page: number } | { error: string }> {
  const safe = q.replace(/[%_,.()]/g, "").toLowerCase();
  if (q && !safe) return { rows: [], total: 0, page };
  const named = safe
    ? await supabaseAdmin.from("customers").select("id").ilike("name", `%${safe}%`).limit(30)
    : { data: [], error: null };
  if (named.error) return { error: "Could not search customers." };
  const customerIds = ((named.data ?? []) as { id: string }[]).map((row) => row.id);
  const { from: start, to: end } = pageRange(page);
  const ranked = supabaseAdmin
    .from("invoices")
    .select("id, bill_no, customer_id, billed_on, status, remarks", { count: "exact" })
    .order("billed_on", { ascending: false })
    .order("id", { ascending: false });
  const after = from ? ranked.gte("billed_on", from) : ranked;
  const before = to ? after.lte("billed_on", to) : after;
  const searched = !safe
    ? before
    : customerIds.length > 0
      ? before.or(`bill_no.ilike.%${safe}%,customer_id.in.(${customerIds.join(",")})`)
      : before.ilike("bill_no", `%${safe}%`);
  const { data, error, count } = await searched.range(start, end);
  if (error) return { error: "Could not load bills." };
  return { rows: (data ?? []) as InvoiceRow[], total: count ?? 0, page };
}

async function summarize(rows: InvoiceRow[]): Promise<{ invoices: InvoiceSummary[] } | { error: string }> {
  if (rows.length === 0) return { invoices: [] };
  const ids = rows.map((row) => row.id);
  const [lines, payments, names] = await Promise.all([
    readIn<{ invoice_id: string; amount: number | string }>(ids, (chunk, start, end) =>
      supabaseAdmin.from("invoice_lines").select("invoice_id, amount").in("invoice_id", chunk).order("id").range(start, end),
    ),
    readIn<{ invoice_id: string; amount: number | string }>(ids, (chunk, start, end) =>
      supabaseAdmin.from("payments").select("invoice_id, amount").in("invoice_id", chunk).order("id").range(start, end),
    ),
    customerNames(rows.map((row) => row.customer_id)),
  ]);
  if (!lines || !payments || !names) return { error: "Could not total the bills." };
  const totals = sumAmounts(lines);
  const collected = sumAmounts(payments);
  return {
    invoices: rows.map((row) => toSummary(row, names.get(row.customer_id) ?? "", totals.get(row.id) ?? 0, collected.get(row.id) ?? 0)),
  };
}

async function loadDetail(id: string): Promise<{ invoice: InvoiceDetail } | { error: string; status: 404 | 500 }> {
  const invoice = await findInvoice(id);
  if (!invoice) return { error: "Bill not found.", status: 404 };
  const [lines, payments, customer] = await Promise.all([
    supabaseAdmin
      .from("invoice_lines")
      .select("id, invoice_id, inventory_item_id, product_id, inventory_no, quantity, rate, amount")
      .eq("invoice_id", id),
    supabaseAdmin.from("payments").select("id, invoice_id, amount, paid_on, showroom").eq("invoice_id", id).order("paid_on"),
    supabaseAdmin.from("customers").select("name").eq("id", invoice.customer_id).maybeSingle(),
  ]);
  if (lines.error || payments.error || customer.error) return { error: "Could not load the bill.", status: 500 };
  const lineRows = (lines.data ?? []) as LineRow[];
  const products = await loadProducts(lineRows.map((row) => row.product_id));
  if (!products) return { error: "Could not load products.", status: 500 };
  const stockIds = lineRows.flatMap((row) => (row.inventory_item_id ? [row.inventory_item_id] : []));
  const stock = await stockStatus(stockIds);
  if (!stock) return { error: "Could not load stock.", status: 500 };
  const mapped = lineRows.flatMap((row) => {
    const product = products.get(row.product_id);
    if (!product) return [];
    const status = row.inventory_item_id ? (stock.get(row.inventory_item_id) ?? "—") : "—";
    return [toLine(row, product, status)];
  });
  const paymentRows = ((payments.data ?? []) as PaymentRow[]).map(toPayment);
  const total = round2(mapped.reduce((sum, line) => sum + line.amount, 0));
  const collected = round2(paymentRows.reduce((sum, payment) => sum + payment.amount, 0));
  return {
    invoice: {
      ...toSummary(invoice, customer.data?.name ?? "", total, collected),
      lines: mapped,
      payments: paymentRows,
    },
  };
}

async function findInvoice(id: string): Promise<InvoiceRow | null> {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, bill_no, customer_id, billed_on, status, remarks")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as InvoiceRow;
}

async function findStock(inventoryNo: string): Promise<StockRow | null> {
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("id, inventory_no, product_id, quantity, status")
    .eq("inventory_no", inventoryNo)
    .maybeSingle();
  if (error || !data) return null;
  return data as StockRow;
}

async function restoreStock(id: string, quantity: number): Promise<boolean> {
  const current = await supabaseAdmin.from("inventory_items").select("id, quantity").eq("id", id).maybeSingle();
  if (current.error || !current.data) return false;
  const next = round3(Number(current.data.quantity) + quantity);
  const { error } = await supabaseAdmin
    .from("inventory_items")
    .update({ quantity: next, status: next > 0 ? "available" : "sold" })
    .eq("id", id);
  return !error;
}

async function loadProducts(ids: string[]): Promise<Map<string, ProductInfo> | null> {
  const unique = [...new Set(ids)];
  const catalogue = new Map<string, ProductInfo>();
  if (unique.length === 0) return catalogue;
  const products = await readIn<{ id: string; group_id: string; code: string; name: string; unit: string; price: number | string }>(
    unique,
    (chunk, start, end) =>
      supabaseAdmin.from("products").select("id, group_id, code, name, unit, price").in("id", chunk).order("id").range(start, end),
  );
  if (!products) return null;
  const groupIds = [...new Set(products.map((row) => row.group_id))];
  if (groupIds.length === 0) return catalogue;
  const groups = await readIn<{ id: string; name: string }>(groupIds, (chunk, start, end) =>
    supabaseAdmin.from("product_groups").select("id, name").in("id", chunk).order("id").range(start, end),
  );
  if (!groups) return null;
  const names = new Map(groups.map((group) => [group.id, group.name]));
  for (const row of products) {
    catalogue.set(row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit === "MT" ? "MT" : "NO",
      price: Number(row.price),
      groupName: names.get(row.group_id) ?? "",
    });
  }
  return catalogue;
}

async function stockStatus(ids: string[]): Promise<Map<string, string> | null> {
  const rows = await readIn<{ id: string; status: string }>(ids, (chunk, start, end) =>
    supabaseAdmin.from("inventory_items").select("id, status").in("id", chunk).order("id").range(start, end),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, row.status]));
}

async function customerNames(ids: string[]): Promise<Map<string, string> | null> {
  const rows = await readIn<{ id: string; name: string }>(ids, (chunk, start, end) =>
    supabaseAdmin.from("customers").select("id, name").in("id", chunk).order("id").range(start, end),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function allocateBillNo(): Promise<string | null> {
  const loaded = await readAll<{ bill_no: string }>((start, end) =>
    supabaseAdmin.from("invoices").select("bill_no").order("id").range(start, end),
  );
  if (!loaded) return null;
  return nextBillNo(loaded.rows.map((row) => row.bill_no));
}

function sumAmounts(rows: { invoice_id: string; amount: number | string }[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.invoice_id, round2((totals.get(row.invoice_id) ?? 0) + Number(row.amount)));
  }
  return totals;
}

function toSummary(row: InvoiceRow, customerName: string, total: number, collected: number): InvoiceSummary {
  return {
    id: row.id,
    billNo: row.bill_no,
    customerId: row.customer_id,
    customerName,
    billedOn: row.billed_on,
    status: row.status,
    remarks: row.remarks,
    total: round2(total),
    collected: round2(collected),
    balance: round2(total - collected),
  };
}

function emptyDetail(row: InvoiceRow, customerName: string): InvoiceDetail {
  return { ...toSummary(row, customerName, 0, 0), lines: [], payments: [] };
}

function toLine(row: LineRow, product: ProductInfo, status: string): InvoiceLine {
  return {
    id: row.id,
    inventoryNo: row.inventory_no,
    productCode: product.code,
    groupName: product.groupName,
    productName: product.name,
    quantity: Number(row.quantity),
    rate: Number(row.rate),
    amount: Number(row.amount),
    status,
  };
}

function toPayment(row: PaymentRow): InvoicePayment {
  return {
    id: row.id,
    amount: Number(row.amount),
    paidOn: row.paid_on,
    showroom: row.showroom,
  };
}

function readRange(from: string | undefined, to: string | undefined): { from: string | null; to: string | null } | { error: string } {
  const start = (from ?? "").trim();
  const end = (to ?? "").trim();
  if ((start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) || (end && !/^\d{4}-\d{2}-\d{2}$/.test(end))) {
    return { error: "Enter a valid date." };
  }
  return { from: start || null, to: end || null };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isDuplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export { sales as salesRoutes };
