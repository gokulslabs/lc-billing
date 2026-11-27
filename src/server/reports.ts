import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PAGE_SIZE, readPage } from "@/lib/paging";
import { monthStart, rangeProblem } from "@/lib/reports";
import type { ReportAnalytics } from "@/lib/report-analytics";
import { isPendingPayment, NEW_COUNTER_FROM, shopToday } from "@/lib/sales";
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

reports.get("/analytics", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const { data, error } = await supabaseAdmin.rpc("shop_business_analytics", {
    p_from: range.from,
    p_to: range.to,
  });
  if (error || !data) return c.json({ error: "Could not load business analytics." }, 500);
  const analytics = data as unknown as ReportAnalytics;
  return c.json(analytics);
});

reports.get("/advanced-analytics", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const section = c.req.query("section") || "overview";
  if (!["overview", "customers", "sales", "inventory", "stitching"].includes(section)) {
    return c.json({ error: "Choose a valid analytics section." }, 400);
  }
  const exporting = c.req.query("export") === "1";
  if (exporting) {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
  }
  const page = readPage(c.req.query("page"), 10000);
  const requestedPageSize = Number(c.req.query("pageSize") || 25);
  const pageSize = Number.isFinite(requestedPageSize)
    ? Math.min(Math.max(Math.floor(requestedPageSize), 1), 100)
    : 25;
  const search = (c.req.query("search") || "").trim().slice(0, 100);
  const { data, error } = await supabaseAdmin.rpc("shop_advanced_analytics", {
    p_from: range.from,
    p_to: range.to,
    p_section: section,
    p_page: page,
    p_page_size: pageSize,
    p_search: search,
  });
  if (error || !data) return c.json({ error: "Could not load advanced analytics." }, 500);
  return c.json(data as unknown as Record<string, unknown>);
});

reports.get("/invoices", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const loaded = await loadInvoiceSummaries(range.from, range.to, false);
  if (!loaded) return c.json({ error: "Could not load invoices." }, 500);
  return c.json({
    invoices: loaded.rows.map(({ billNo, billedOn, customerName, gross, discount, net }) => ({
      billNo,
      billedOn,
      customerName,
      gross,
      discount,
      net,
    })),
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
  const rows = payments.rows.filter((row) => !isPendingPayment(row.mode));
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
  const rows = payments.rows.filter((row) => !isPendingPayment(row.mode));
  const invoices = await loadInvoiceMap(rows.map((row) => row.invoice_id));
  if (!invoices) return c.json({ error: "Could not load bills." }, 500);
  const customers = await loadCustomers([...invoices.values()].map((row) => row.customer_id));
  if (!customers) return c.json({ error: "Could not load customers." }, 500);
  return c.json({
    payments: rows.map((row) => {
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
  const exporting = c.req.query("export") === "1";
  if (exporting) {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
  }
  const { data, error } = await supabaseAdmin.rpc("shop_pending_report", {
    p_new_counter_from: NEW_COUNTER_FROM,
    p_old: books === "old",
    p_offset: exporting ? 0 : (page - 1) * PAGE_SIZE,
    p_limit: exporting ? null : PAGE_SIZE,
  });
  if (error || !data) return c.json({ error: "Could not load pending bills." }, 500);
  return c.json({ ...data, page, books });
});

reports.get("/mismatch", async (c) => {
  const { data, error } = await supabaseAdmin.rpc("shop_inventory_mismatches");
  if (error || !data) return c.json({ error: "Could not check stock." }, 500);
  return c.json({ mismatches: data });
});

reports.get("/returns", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const loaded = await loadInvoiceSummaries(range.from, range.to, true);
  if (!loaded) return c.json({ error: "Could not load returns." }, 500);
  return c.json({
    returns: loaded.rows.map(({ billNo, billedOn, customerName, net, remarks }) => ({
      billNo,
      billedOn,
      customerName,
      net,
      remarks,
    })),
  });
});

function readRange(
  fromQuery: string | undefined,
  toQuery: string | undefined,
): { from: string; to: string } | { error: string } {
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
    const filtered =
      which === "cancelled"
        ? ranked.eq("status", "cancelled")
        : ranked.neq("status", "cancelled").neq("status", "draft");
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
): Promise<
  | { rows: Record<string, string | number | null>[]; status: 200 }
  | { error: string; status: 400 | 500 }
> {
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

function loadInvoiceSummaries(from: string, to: string, cancelled: boolean) {
  return readAll((start, end) =>
    supabaseAdmin
      .rpc("shop_invoice_report", { p_from: from, p_to: to, p_cancelled: cancelled })
      .range(start, end),
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

async function loadProducts(
  ids: string[],
): Promise<Map<string, { code: string; name: string }> | null> {
  const rows = await readIn<{ id: string; code: string; name: string }>(ids, (chunk, from, to) =>
    supabaseAdmin
      .from("products")
      .select("id, code, name")
      .in("id", chunk)
      .order("id")
      .range(from, to),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, { code: row.code, name: row.name }]));
}

export { reports as reportRoutes };
