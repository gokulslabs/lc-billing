import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PAGE_SIZE, readPage } from "@/lib/paging";
import { billTotals, moneyBalance, monthStart, pendingTotals, pricedBill, rangeProblem, stockGap } from "@/lib/reports";
import { billBook, paymentStatus, shopToday } from "@/lib/sales";
import { denyUnlessAdmin, requireShop } from "@/server/guard";
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
  invoice_id: string;
  inventory_no: string;
  product_id: string;
  quantity: number | string;
  rate: number | string;
  amount: number | string;
};

type PaymentRow = {
  invoice_id: string;
  amount: number | string;
  paid_on: string;
  showroom: string | null;
  mode?: string | null;
};

const reports = new Hono<Env>();
reports.use("*", requireShop);

reports.get("/invoices", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const loaded = await loadInvoices(range.from, range.to, "active");
  if (!loaded) return c.json({ error: "Could not load invoices." }, 500);
  const lines = await loadLines(loaded.rows.map((row) => row.id));
  if (!lines) return c.json({ error: "Could not load invoice lines." }, 500);
  return c.json({
    invoices: loaded.rows.map((row) => {
      const totals = pricedBill(
        lines
          .filter((line) => line.invoice_id === row.id)
          .map((line) => ({ quantity: Number(line.quantity), rate: Number(line.rate), amount: Number(line.amount) })),
      );
      return {
        billNo: row.bill_no,
        billedOn: row.billed_on,
        customerName: loaded.customers.get(row.customer_id) ?? "",
        gross: totals.gross,
        discount: totals.discount,
        net: totals.net,
      };
    }),
  });
});

reports.get("/items", async (c) => {
  const detailed = await lineReport(c.req.query("from"), c.req.query("to"), false);
  if ("error" in detailed) return c.json({ error: detailed.error }, detailed.status);
  return c.json({ items: detailed.rows });
});

reports.get("/extract", async (c) => {
  const detailed = await lineReport(c.req.query("from"), c.req.query("to"), true);
  if ("error" in detailed) return c.json({ error: detailed.error }, detailed.status);
  return c.json({ rows: detailed.rows });
});

reports.get("/collections", async (c) => {
  const date = c.req.query("date") || shopToday();
  if (rangeProblem(date, date)) return c.json({ error: "Enter a valid date." }, 400);
  const payments = await readAll<PaymentRow>((from, to) =>
    supabaseAdmin
      .from("payments")
      .select("invoice_id, amount, paid_on, showroom, mode")
      .eq("paid_on", date)
      .order("paid_on")
      .order("id")
      .range(from, to),
  );
  if (!payments) return c.json({ error: "Could not load collections." }, 500);
  const rows = payments.rows;
  const invoices = await loadInvoiceMap(rows.map((row) => row.invoice_id));
  if (!invoices) return c.json({ error: "Could not load bills." }, 500);
  return c.json({
    collections: rows.map((row) => ({
      showroom: row.showroom,
      billNo: invoices.get(row.invoice_id)?.bill_no ?? "",
      paidOn: row.paid_on,
      remarks: invoices.get(row.invoice_id)?.remarks ?? null,
      mode: row.mode ?? null,
      amount: Number(row.amount),
    })),
  });
});

reports.get("/showrooms", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const payments = await readAll<PaymentRow>((from, to) =>
    supabaseAdmin
      .from("payments")
      .select("invoice_id, amount, paid_on, showroom, mode")
      .gte("paid_on", range.from)
      .lte("paid_on", range.to)
      .order("paid_on")
      .order("id")
      .range(from, to),
  );
  if (!payments) return c.json({ error: "Could not load collections." }, 500);
  const invoices = await loadInvoiceMap(payments.rows.map((row) => row.invoice_id));
  if (!invoices) return c.json({ error: "Could not load bills." }, 500);
  const customers = await loadCustomers([...invoices.values()].map((row) => row.customer_id));
  if (!customers) return c.json({ error: "Could not load customers." }, 500);
  return c.json({
    payments: payments.rows.map((row) => {
      const invoice = invoices.get(row.invoice_id);
      return {
        paidOn: row.paid_on,
        billNo: invoice?.bill_no ?? "",
        customerName: invoice ? (customers.get(invoice.customer_id) ?? "") : "",
        mode: row.mode ?? null,
        showroom: row.showroom,
        amount: Number(row.amount),
      };
    }),
  });
});

reports.get("/pending", async (c) => {
  const books = c.req.query("books") === "old" ? "old" : "new";
  const page = readPage(c.req.query("page"));
  const loaded = await readAll<InvoiceRow>((from, to) =>
    supabaseAdmin
      .from("invoices")
      .select("id, bill_no, customer_id, billed_on, status, remarks")
      .in("status", ["open", "partial"])
      .order("billed_on")
      .order("id")
      .range(from, to),
  );
  if (!loaded) return c.json({ error: "Could not load pending bills." }, 500);
  const invoices = loaded.rows.filter((row) => billBook(row.billed_on) === books);
  const [lines, payments] = await Promise.all([loadLines(invoices.map((row) => row.id)), loadPayments(invoices.map((row) => row.id))]);
  if (!lines || !payments) return c.json({ error: "Could not load pending bills." }, 500);
  const pending = invoices.flatMap((invoice) => {
    const invoiced = billTotals(lines.filter((line) => line.invoice_id === invoice.id).map((line) => Number(line.amount))).net;
    const paidRows = payments.filter((row) => row.invoice_id === invoice.id);
    const paid = paidRows.reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0) / 100;
    const balance = moneyBalance(invoiced, paid);
    if (balance <= 0) return [];
    const showrooms = [...new Set(paidRows.flatMap((row) => (row.showroom ? [row.showroom] : [])))];
    return [
      {
        customerId: invoice.customer_id,
        billNo: invoice.bill_no,
        billedOn: invoice.billed_on,
        showroom: showrooms.length ? showrooms.join(", ") : null,
        invoiced,
        paid,
        balance,
        status: paymentStatus(invoiced, paid, invoice.status),
      },
    ];
  });
  const totals = pendingTotals(pending);
  const exporting = c.req.query("export") === "1";
  if (exporting) {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
  }
  const start = (page - 1) * PAGE_SIZE;
  const slice = exporting ? pending : pending.slice(start, start + PAGE_SIZE);
  const customers = await loadCustomers(slice.map((row) => row.customerId));
  if (!customers) return c.json({ error: "Could not load pending bills." }, 500);
  return c.json({
    pending: slice.map((row) => ({
      customerName: customers.get(row.customerId) ?? "",
      billNo: row.billNo,
      billedOn: row.billedOn,
      showroom: row.showroom,
      invoiced: row.invoiced,
      paid: row.paid,
      balance: row.balance,
      status: row.status,
    })),
    total: pending.length,
    page,
    books,
    totals,
  });
});

reports.get("/mismatch", async (c) => {
  const [stock, lines, invoices] = await Promise.all([
    readAll<{ id: string; inventory_no: string; product_id: string; quantity: number | string; received_quantity: number | string }>(
      (from, to) =>
        supabaseAdmin
          .from("inventory_items")
          .select("id, inventory_no, product_id, quantity, received_quantity")
          .order("id")
          .range(from, to),
    ),
    readAll<{ inventory_item_id: string | null; invoice_id: string; quantity: number | string }>((from, to) =>
      supabaseAdmin
        .from("invoice_lines")
        .select("inventory_item_id, invoice_id, quantity")
        .order("id")
        .range(from, to),
    ),
    readAll<{ id: string; status: string }>((from, to) =>
      supabaseAdmin.from("invoices").select("id, status").neq("status", "cancelled").order("id").range(from, to),
    ),
  ]);
  if (!stock || !lines || !invoices) return c.json({ error: "Could not check stock." }, 500);
  const active = new Set(invoices.rows.map((row) => row.id));
  const billed = new Map<string, number>();
  for (const line of lines.rows) {
    if (!line.inventory_item_id || !active.has(line.invoice_id)) continue;
    billed.set(line.inventory_item_id, (billed.get(line.inventory_item_id) ?? 0) + Number(line.quantity));
  }
  const catalogue = await loadProducts(stock.rows.map((row) => row.product_id));
  if (!catalogue) return c.json({ error: "Could not load products." }, 500);
  const mismatches = stock.rows.flatMap((row) => {
    const received = Number(row.received_quantity);
    const onHand = Number(row.quantity);
    const sold = Math.round((billed.get(row.id) ?? 0) * 1000) / 1000;
    const difference = stockGap(received, onHand, sold);
    if (difference === 0) return [];
    const product = catalogue.get(row.product_id);
    return [
      {
        inventoryNo: row.inventory_no,
        productCode: product?.code ?? "",
        productName: product?.name ?? "",
        received,
        billed: sold,
        onHand,
        difference,
      },
    ];
  });
  return c.json({ mismatches });
});

reports.get("/returns", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const loaded = await loadInvoices(range.from, range.to, "cancelled");
  if (!loaded) return c.json({ error: "Could not load returns." }, 500);
  const lines = await loadLines(loaded.rows.map((row) => row.id));
  if (!lines) return c.json({ error: "Could not load returns." }, 500);
  return c.json({
    returns: loaded.rows.map((row) => ({
      billNo: row.bill_no,
      billedOn: row.billed_on,
      customerName: loaded.customers.get(row.customer_id) ?? "",
      net: billTotals(lines.filter((line) => line.invoice_id === row.id).map((line) => Number(line.amount))).net,
      remarks: row.remarks,
    })),
  });
});

function readRange(fromQuery: string | undefined, toQuery: string | undefined): { from: string; to: string } | { error: string } {
  const today = shopToday();
  const from = fromQuery || monthStart(today);
  const to = toQuery || today;
  const problem = rangeProblem(from, to);
  if (problem) return { error: problem };
  return { from, to };
}

async function loadInvoices(
  from: string,
  to: string,
  which: "active" | "cancelled",
): Promise<{ rows: InvoiceRow[]; customers: Map<string, string> } | null> {
  const columns = "id, bill_no, customer_id, billed_on, status, remarks";
  const loaded = await readAll<InvoiceRow>((start, end) => {
    const ranked = supabaseAdmin
      .from("invoices")
      .select(columns)
      .gte("billed_on", from)
      .lte("billed_on", to)
      .order("billed_on")
      .order("id");
    const filtered = which === "cancelled" ? ranked.eq("status", "cancelled") : ranked.neq("status", "cancelled").neq("status", "draft");
    return filtered.range(start, end);
  });
  if (!loaded) return null;
  const rows = loaded.rows;
  const customers = await loadCustomers(rows.map((row) => row.customer_id));
  if (!customers) return null;
  return { rows, customers };
}

async function lineReport(
  fromQuery: string | undefined,
  toQuery: string | undefined,
  withCustomer: boolean,
): Promise<{ rows: Record<string, string | number | null>[]; status: 200 } | { error: string; status: 400 | 500 }> {
  const range = readRange(fromQuery, toQuery);
  if ("error" in range) return { error: range.error, status: 400 };
  const loaded = await loadInvoices(range.from, range.to, "active");
  if (!loaded) return { error: "Could not load invoices.", status: 500 };
  const lines = await loadLines(loaded.rows.map((row) => row.id));
  if (!lines) return { error: "Could not load invoice lines.", status: 500 };
  const products = await loadProducts(lines.map((line) => line.product_id));
  if (!products) return { error: "Could not load products.", status: 500 };
  const invoices = new Map(loaded.rows.map((row) => [row.id, row]));
  const rows = lines.flatMap((line) => {
    const invoice = invoices.get(line.invoice_id);
    const product = products.get(line.product_id);
    if (!invoice || !product) return [];
    return [
      {
        billNo: invoice.bill_no,
        billedOn: invoice.billed_on,
        customerName: withCustomer ? (loaded.customers.get(invoice.customer_id) ?? "") : null,
        inventoryNo: line.inventory_no,
        productCode: product.code,
        productName: product.name,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        amount: Number(line.amount),
      },
    ];
  });
  return { rows, status: 200 };
}

async function loadLines(ids: string[]): Promise<LineRow[] | null> {
  return readIn<LineRow>(ids, (chunk, from, to) =>
    supabaseAdmin
      .from("invoice_lines")
      .select("invoice_id, inventory_no, product_id, quantity, rate, amount")
      .in("invoice_id", chunk)
      .order("id")
      .range(from, to),
  );
}

async function loadPayments(ids: string[]): Promise<PaymentRow[] | null> {
  return readIn<PaymentRow>(ids, (chunk, from, to) =>
    supabaseAdmin
      .from("payments")
      .select("invoice_id, amount, paid_on, showroom")
      .in("invoice_id", chunk)
      .order("id")
      .range(from, to),
  );
}

async function loadInvoiceMap(ids: string[]): Promise<Map<string, InvoiceRow> | null> {
  const rows = await readIn<InvoiceRow>(ids, (chunk, from, to) =>
    supabaseAdmin
      .from("invoices")
      .select("id, bill_no, customer_id, billed_on, status, remarks")
      .in("id", chunk)
      .order("id")
      .range(from, to),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadCustomers(ids: string[]): Promise<Map<string, string> | null> {
  const rows = await readIn<{ id: string; name: string }>(ids, (chunk, from, to) =>
    supabaseAdmin.from("customers").select("id, name").in("id", chunk).order("id").range(from, to),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function loadProducts(ids: string[]): Promise<Map<string, { code: string; name: string }> | null> {
  const rows = await readIn<{ id: string; code: string; name: string }>(ids, (chunk, from, to) =>
    supabaseAdmin.from("products").select("id, code, name").in("id", chunk).order("id").range(from, to),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, { code: row.code, name: row.name }]));
}

export { reports as reportRoutes };
