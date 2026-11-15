import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  blankToNull,
  isUnrecordedName,
  UNRECORDED_BILL_ERROR,
  UNRECORDED_NAME,
} from "@/lib/customers";
import { quantityForUnit } from "@/lib/inventory";
import type { Unit } from "@/lib/products";
import {
  BILL_PAYS,
  BILL_SORTS,
  lineAmount,
  cancelInvoiceSchema,
  assignCustomerSchema,
  createInvoiceSchema,
  invoiceLineSchema,
  invoiceDiscountSchema,
  billBook,
  selectBills,
  PAYMENT_MODES,
  isPendingPayment,
  paymentSchema,
  paymentStatus,
  priceLine,
  removePaymentSchema,
  returnLineSchema,
  returnQuantity,
  shopToday,
  zodMessage,
  type InvoiceDetail,
  type InvoiceItem,
  type InvoiceLine,
  type InvoicePayment,
  type InvoiceSummary,
} from "@/lib/sales";
import { PAGE_SIZE, pageRange, readPage } from "@/lib/paging";
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
  mode: string | null;
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
  discountPercent: number;
};

const sales = new Hono<Env>();
sales.use("*", requireShop);

sales.get("/lookup", async (c) => {
  const billNo = c.req.query("billNo")?.trim() ?? "";
  if (!billNo || billNo.length > 80) return c.json({ error: "Enter a valid bill number." }, 400);
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id")
    .eq("bill_no", billNo)
    .maybeSingle();
  if (error) return c.json({ error: "Could not look up the bill." }, 500);
  if (!data) return c.json({ error: "No bill found with that exact number." }, 404);
  return c.json({ id: data.id });
});

sales.get("/items", async (c) => {
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const exporting = c.req.query("export") === "1";
  if (exporting) {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
  }
  const invoices = await loadInvoices(
    range.from,
    range.to,
    q,
    readPage(c.req.query("page")),
    exporting,
  );
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
      discountPercent: product.discountPercent,
      status: stock.status,
      available: stock.status === "available" ? Number(stock.quantity) : 0,
    },
  });
});

sales.get("/due", async (c) => {
  const exporting = c.req.query("export") === "1";
  if (exporting) {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
  }
  const page = readPage(c.req.query("page"));
  const books = c.req.query("books") === "old" ? "old" : "new";
  const loaded = await readAll<InvoiceRow>((start, end) =>
    supabaseAdmin
      .from("invoices")
      .select("id, bill_no, customer_id, billed_on, status, remarks")
      .in("status", ["open", "partial"])
      .order("billed_on", { ascending: true })
      .order("id")
      .range(start, end),
  );
  if (!loaded) return c.json({ error: "Could not load unpaid bills." }, 500);
  const summaries = await summarize(loaded.rows);
  if ("error" in summaries) return c.json({ error: summaries.error }, 500);
  const due = summaries.invoices.filter(
    (invoice) => invoice.balance > 0.001 && billBook(invoice.billedOn) === books,
  );
  if (exporting) {
    const balance = due.reduce(
      (sum, invoice) => (Math.round(sum * 100) + Math.round(invoice.balance * 100)) / 100,
      0,
    );
    return c.json({ invoices: due, total: due.length, page: 1, books, balance });
  }
  const start = (page - 1) * 50;
  const balance = due.reduce(
    (sum, invoice) => (Math.round(sum * 100) + Math.round(invoice.balance * 100)) / 100,
    0,
  );
  return c.json({
    invoices: due.slice(start, start + 50),
    total: due.length,
    page,
    books,
    balance,
  });
});

sales.get("/pending", async (c) => {
  const entries = await readAll<{
    id: string;
    invoice_id: string;
    amount: number | string;
    paid_on: string;
    showroom: string | null;
  }>((from, to) =>
    supabaseAdmin
      .from("payments")
      .select("id, invoice_id, amount, paid_on, showroom")
      .eq("mode", "PENDING")
      .order("paid_on")
      .range(from, to),
  );
  if (!entries) return c.json({ error: "Could not load pending promises." }, 500);
  const invoiceIds = [...new Set(entries.rows.map((row) => row.invoice_id))];
  if (invoiceIds.length === 0) return c.json({ promises: [] });
  const invoices = await readIn<InvoiceRow>(invoiceIds, (chunk, from, to) =>
    supabaseAdmin
      .from("invoices")
      .select("id, bill_no, customer_id, billed_on, status, remarks")
      .in("id", chunk)
      .neq("status", "cancelled")
      .range(from, to),
  );
  if (!invoices) return c.json({ error: "Could not load pending bills." }, 500);
  const summaries = await summarize(invoices);
  if ("error" in summaries) return c.json({ error: summaries.error }, 500);
  const byInvoice = new Map(summaries.invoices.map((row) => [row.id, row]));
  const names = await customerNames(invoices.map((row) => row.customer_id));
  if (!names) return c.json({ error: "Could not load pending customers." }, 500);
  const promises = entries.rows
    .flatMap((row) => {
      const bill = byInvoice.get(row.invoice_id);
      if (!bill) return [];
      return [
        {
          id: row.id,
          invoiceId: bill.id,
          billNo: bill.billNo,
          customerId: bill.customerId,
          customerName: names.get(bill.customerId) ?? "",
          dueOn: row.paid_on,
          amount: round2(Number(row.amount)),
          balance: bill.balance,
          note: row.showroom,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.dueOn.localeCompare(b.dueOn) ||
        a.billNo.localeCompare(b.billNo, undefined, { numeric: true }),
    );
  return c.json({ promises });
});

sales.get("/close", async (c) => {
  const date = (c.req.query("date") ?? shopToday()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: "Enter a valid date." }, 400);
  const { data, error } = await supabaseAdmin.rpc("shop_day_close", {
    p_day: date,
    p_modes: PAYMENT_MODES.filter((mode) => !isPendingPayment(mode)),
  });
  if (error || !data) return c.json({ error: "Could not close the day." }, 500);
  return c.json(data);
});

sales.get("/", async (c) => {
  const exporting = c.req.query("export") === "1";
  if (exporting) {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
  }
  const range = readRange(c.req.query("from"), c.req.query("to"));
  if ("error" in range) return c.json({ error: range.error }, 400);
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const pay = BILL_PAYS.find((item) => item === c.req.query("pay")) ?? "all";
  const sort = BILL_SORTS.find((item) => item === c.req.query("sort")) ?? "date";
  const direction = c.req.query("dir") === "asc" ? "asc" : "desc";
  const page = readPage(c.req.query("page"));
  const loaded = await loadInvoices(range.from, range.to, q, page, true);
  if ("error" in loaded) return c.json({ error: loaded.error }, 500);
  const summaries = await summarize(loaded.rows);
  if ("error" in summaries) return c.json({ error: summaries.error }, 500);
  const chosen = selectBills(summaries.invoices, pay, sort, direction);
  if (exporting) {
    return c.json({ invoices: chosen, total: chosen.length, page: 1 });
  }
  const start = (page - 1) * PAGE_SIZE;
  return c.json({ invoices: chosen.slice(start, start + PAGE_SIZE), total: chosen.length, page });
});

sales.post("/", async (c) => {
  const parsed = createInvoiceSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const customer = await supabaseAdmin
    .from("customers")
    .select("id, name, phone")
    .eq("id", parsed.data.customerId)
    .maybeSingle();
  if (customer.error) return c.json({ error: "Could not check the customer." }, 500);
  if (!customer.data || isUnrecordedName(customer.data.name))
    return c.json({ error: UNRECORDED_BILL_ERROR }, 400);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .insert({
        customer_id: customer.data.id,
        billed_on: shopToday(),
        status: "draft",
      })
      .select("id, bill_no, customer_id, billed_on, status, remarks")
      .single();
    if (isDuplicate(error) && attempt === 0) continue;
    if (error || !data) return c.json({ error: "Could not open the bill." }, 500);
    return c.json(
      { invoice: emptyDetail(data as InvoiceRow, customer.data.name, customer.data.phone ?? "") },
      201,
    );
  }
  return c.json({ error: "Could not open the bill." }, 500);
});

sales.get("/unrecorded", async (c) => {
  const exporting = c.req.query("export") === "1";
  if (exporting) {
    const denied = await denyUnlessAdmin(c);
    if (denied) return denied;
  }
  const page = readPage(c.req.query("page"));
  const people = await readAll<{ id: string; name: string }>((from, to) =>
    supabaseAdmin
      .from("customers")
      .select("id, name")
      .ilike("name", `%${UNRECORDED_NAME}%`)
      .order("id")
      .range(from, to),
  );
  if (!people) return c.json({ error: "Could not load these bills." }, 500);
  const ids = people.rows.filter((row) => isUnrecordedName(row.name)).map((row) => row.id);
  if (ids.length === 0) return c.json({ invoices: [], total: 0, page });
  const loaded = await readAll<InvoiceRow>((from, to) =>
    supabaseAdmin
      .from("invoices")
      .select("id, bill_no, customer_id, billed_on, status, remarks")
      .in("customer_id", ids)
      .order("billed_on", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to),
  );
  if (!loaded) return c.json({ error: "Could not load these bills." }, 500);
  const summaries = await summarize(loaded.rows);
  if ("error" in summaries) return c.json({ error: summaries.error }, 500);
  if (exporting) {
    return c.json({ invoices: summaries.invoices, total: summaries.invoices.length, page: 1 });
  }
  const start = (page - 1) * PAGE_SIZE;
  return c.json({
    invoices: summaries.invoices.slice(start, start + PAGE_SIZE),
    total: summaries.invoices.length,
    page,
  });
});

sales.get("/:id", async (c) => {
  const detail = await loadDetail(c.req.param("id"));
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/customer", async (c) => {
  const parsed = assignCustomerSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  const customer = await customerRecord(parsed.data.customerId);
  if (customer === "error") return c.json({ error: "Could not check the customer." }, 500);
  if (!customer || isUnrecordedName(customer.name))
    return c.json({ error: UNRECORDED_BILL_ERROR }, 400);
  const { error } = await supabaseAdmin
    .from("invoices")
    .update({ customer_id: customer.id })
    .eq("id", invoice.id);
  if (error) return c.json({ error: "Could not attach the customer." }, 500);
  const detail = await loadDetail(invoice.id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/lines", async (c) => {
  const parsed = invoiceLineSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  if (invoice.status === "cancelled") return c.json({ error: "This bill is cancelled." }, 400);
  const named = await customerRecord(invoice.customer_id);
  if (named === "error") return c.json({ error: "Could not check the customer." }, 500);
  if (!named || isUnrecordedName(named.name)) return c.json({ error: UNRECORDED_BILL_ERROR }, 400);

  const stock = await findStock(parsed.data.inventoryNo);
  if (!stock) return c.json({ error: "Inventory number not found." }, 400);
  if (stock.status !== "available") {
    return c.json({ error: "This inventory number is marked unavailable for sale." }, 400);
  }
  const products = await loadProducts([stock.product_id]);
  const product = products?.get(stock.product_id);
  if (!product) return c.json({ error: "Could not load this product." }, 500);
  const quantityError = quantityForUnit(product.unit, parsed.data.quantity);
  if (quantityError) return c.json({ error: quantityError }, 400);
  if (product.unit === "NO") {
    const already = await pieceAlreadyBilled(stock.id);
    if (already === "error") return c.json({ error: "Could not check this piece." }, 500);
    if (already.length > 0) {
      const label = already.length === 1 ? `bill ${already[0]}` : `bills ${already.join(", ")}`;
      return c.json({ error: `This piece is already on ${label}.` }, 400);
    }
  }
  const available = Number(stock.quantity);
  if (parsed.data.quantity > available + 0.0001)
    return c.json({ error: "Not enough stock on this inventory number." }, 400);

  const priced = priceLine(
    parsed.data.quantity,
    product.price,
    product.discountPercent,
    parsed.data.rate,
    parsed.data.extraOff,
    parsed.data.discountPercent,
  );
  const { data: lineId, error } = await supabaseAdmin.rpc("shop_add_invoice_line", {
    p_invoice_id: invoice.id,
    p_customer_id: invoice.customer_id,
    p_stock_id: stock.id,
    p_product_id: stock.product_id,
    p_inventory_no: stock.inventory_no,
    p_expected_stock: available,
    p_quantity: parsed.data.quantity,
    p_rate: priced.rate,
    p_amount: priced.amount,
    p_is_piece: product.unit === "NO",
  });
  if (error?.code === "PT409") return c.json({ error: error.message }, 409);
  if (error || !lineId) return c.json({ error: "Could not add the line." }, 500);
  const detail = await loadDetail(invoice.id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  const savedLine = detail.invoice.lines.find((line) => line.id === lineId);
  if (!savedLine) return c.json({ error: "The saved line could not be loaded." }, 500);
  return c.json({ invoice: detail.invoice, line: savedLine }, 201);
});

sales.post("/:id/lines/:lineId/return", async (c) => {
  const parsed = returnLineSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  if (invoice.status === "cancelled") return c.json({ error: "This bill is cancelled." }, 400);
  const line = await supabaseAdmin
    .from("invoice_lines")
    .select("id, invoice_id, inventory_item_id, product_id, inventory_no, quantity, rate, amount")
    .eq("id", c.req.param("lineId"))
    .eq("invoice_id", invoice.id)
    .maybeSingle();
  if (line.error) return c.json({ error: "Could not check this line." }, 500);
  if (!line.data) return c.json({ error: "Line not found." }, 404);
  const row = line.data as LineRow;
  const products = await loadProducts([row.product_id]);
  const product = products?.get(row.product_id);
  if (!product) return c.json({ error: "Could not load this product." }, 500);
  const quantityError = quantityForUnit(product.unit, parsed.data.quantity);
  if (quantityError) return c.json({ error: quantityError }, 400);
  const next = returnQuantity(Number(row.quantity), Number(row.amount), parsed.data.quantity);
  if (typeof next === "string") return c.json({ error: next }, 400);
  const { error } = await supabaseAdmin.rpc("shop_return_invoice_line", {
    p_invoice_id: invoice.id,
    p_line_id: row.id,
    p_expected_quantity: Number(row.quantity),
    p_expected_amount: Number(row.amount),
    p_new_quantity: next.quantity,
    p_new_amount: next.amount,
  });
  if (error?.code === "PT409") return c.json({ error: error.message }, 409);
  if (error) return c.json({ error: "Could not return this line." }, 500);
  const detail = await loadDetail(invoice.id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/discount", async (c) => {
  const parsed = invoiceDiscountSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const id = c.req.param("id");
  const { data: outcome, error } = await supabaseAdmin.rpc("shop_set_invoice_discount", {
    p_invoice_id: id,
    p_discount: parsed.data.discount,
  });
  if (error || !outcome) return c.json({ error: "Could not save the bill discount." }, 500);
  if (outcome === "not_found") return c.json({ error: "Bill not found." }, 404);
  if (outcome === "cancelled") return c.json({ error: "This bill is cancelled." }, 400);
  if (outcome === "no_lines")
    return c.json({ error: "Add an item before setting a bill discount." }, 400);
  if (outcome === "invalid_discount")
    return c.json({ error: "Discount cannot be more than the gross amount." }, 400);
  if (outcome === "below_collected")
    return c.json(
      { error: "The new total cannot be less than the amount already collected." },
      400,
    );
  const detail = await loadDetail(id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/cancel", async (c) => {
  const parsed = cancelInvoiceSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const id = c.req.param("id");
  const { data: outcome, error } = await supabaseAdmin.rpc("shop_cancel_invoice", {
    p_invoice_id: id,
    p_remarks: parsed.data.remarks,
  });
  if (error || !outcome) return c.json({ error: "Could not cancel the bill." }, 500);
  if (outcome === "not_found") return c.json({ error: "Bill not found." }, 404);
  if (outcome === "cancelled") return c.json({ error: "This bill is already cancelled." }, 400);
  if (outcome === "has_payment")
    return c.json({ error: "This bill has a payment. Remove it before cancelling." }, 400);
  const detail = await loadDetail(id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.post("/:id/payments", async (c) => {
  const parsed = paymentSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const id = c.req.param("id");
  const { data: outcome, error } = await supabaseAdmin.rpc("shop_collect_invoice", {
    p_invoice_id: id,
    p_amount: parsed.data.amount,
    p_paid_on: parsed.data.paidOn,
    p_mode: parsed.data.mode,
    p_showroom: blankToNull(parsed.data.showroom),
  });
  if (error || !outcome) return c.json({ error: "Could not save the collection." }, 500);
  if (outcome === "not_found") return c.json({ error: "Bill not found." }, 404);
  if (outcome === "cancelled") return c.json({ error: "This bill is cancelled." }, 400);
  if (outcome === "invalid_amount") return c.json({ error: "Enter at least ₹0.01." }, 400);
  if (outcome === "exceeds_balance")
    return c.json({ error: "Amount is more than the balance." }, 400);
  const next = await loadDetail(id);
  if ("error" in next) return c.json({ error: next.error }, next.status);
  return c.json({ invoice: next.invoice }, 201);
});

sales.post("/:id/payments/:paymentId/remove", async (c) => {
  const parsed = removePaymentSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const id = c.req.param("id");
  const { data: outcome, error } = await supabaseAdmin.rpc("shop_remove_invoice_payment", {
    p_invoice_id: id,
    p_payment_id: c.req.param("paymentId"),
    p_today: shopToday(),
    p_reason: parsed.data.reason,
  });
  if (error || !outcome) return c.json({ error: "Could not remove the payment." }, 500);
  if (outcome === "not_found") return c.json({ error: "Bill not found." }, 404);
  if (outcome === "cancelled") return c.json({ error: "This bill is cancelled." }, 400);
  if (outcome === "payment_not_found") return c.json({ error: "Payment not found." }, 404);
  if (outcome === "older_payment")
    return c.json({ error: "Only a payment taken today can be removed." }, 400);
  const detail = await loadDetail(id);
  if ("error" in detail) return c.json({ error: detail.error }, detail.status);
  return c.json({ invoice: detail.invoice });
});

sales.delete("/:id", async (c) => {
  const invoice = await findInvoice(c.req.param("id"));
  if (!invoice) return c.json({ error: "Bill not found." }, 404);
  if (invoice.status === "cancelled")
    return c.json({ error: "A cancelled bill stays on record." }, 400);
  const [lines, payments] = await Promise.all([
    supabaseAdmin
      .from("invoice_lines")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoice.id),
    supabaseAdmin
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", invoice.id),
  ]);
  if (lines.error || payments.error) return c.json({ error: "Could not check this bill." }, 500);
  if ((lines.count ?? 0) > 0 || (payments.count ?? 0) > 0) {
    return c.json({ error: "Cancel the bill instead. It already has lines or a collection." }, 400);
  }
  return c.json({ error: "Cancel the bill instead. Empty bills stay on record." }, 400);
});

async function loadInvoices(
  from: string | null,
  to: string | null,
  q: string,
  page: number,
  all = false,
): Promise<{ rows: InvoiceRow[]; total: number; page: number } | { error: string }> {
  const safe = q.replace(/[%_,.()]/g, "").toLowerCase();
  if (q && !safe) return { rows: [], total: 0, page };
  const named = safe
    ? await supabaseAdmin
        .from("customers")
        .select("id")
        .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%,book_no.ilike.%${safe}%`)
        .order("name")
        .limit(40)
    : { data: [], error: null };
  if (named.error) return { error: "Could not search customers." };
  const customerIds = ((named.data ?? []) as { id: string }[]).map((row) => row.id);
  const scoped = () => {
    const ranked = supabaseAdmin
      .from("invoices")
      .select("id, bill_no, customer_id, billed_on, status, remarks", { count: "exact" })
      .order("billed_on", { ascending: false })
      .order("id", { ascending: false });
    const after = from ? ranked.gte("billed_on", from) : ranked;
    const before = to ? after.lte("billed_on", to) : after;
    if (!safe) return before;
    if (customerIds.length > 0)
      return before.or(`bill_no.ilike.%${safe}%,customer_id.in.(${customerIds.join(",")})`);
    return before.ilike("bill_no", `%${safe}%`);
  };
  if (all) {
    const loaded = await readAll<InvoiceRow>((start, end) => scoped().range(start, end));
    if (!loaded) return { error: "Could not load bills." };
    return { rows: loaded.rows, total: loaded.rows.length, page };
  }
  const { from: start, to: end } = pageRange(page);
  const { data, error, count } = await scoped().range(start, end);
  if (error) return { error: "Could not load bills." };
  return { rows: (data ?? []) as InvoiceRow[], total: count ?? 0, page };
}

async function summarize(
  rows: InvoiceRow[],
): Promise<{ invoices: InvoiceSummary[] } | { error: string }> {
  if (rows.length === 0) return { invoices: [] };
  const [amounts, names] = await Promise.all([
    readIn(
      rows.map((row) => row.id),
      (ids, start, end) => supabaseAdmin.rpc("shop_bill_amounts", { p_ids: ids }).range(start, end),
    ),
    customerNames(rows.map((row) => row.customer_id)),
  ]);
  if (!amounts || !names) return { error: "Could not total the bills." };
  const totals = new Map(amounts.map((row) => [row.invoice_id, row]));
  return {
    invoices: rows.map((row) => {
      const money = totals.get(row.id);
      return toSummary(
        row,
        names.get(row.customer_id) ?? "",
        Number(money?.net ?? 0),
        Number(money?.collected ?? 0),
        Number(money?.gross ?? 0),
      );
    }),
  };
}

async function loadDetail(
  id: string,
): Promise<{ invoice: InvoiceDetail } | { error: string; status: 404 | 500 }> {
  const invoice = await findInvoice(id);
  if (!invoice) return { error: "Bill not found.", status: 404 };
  const [lines, payments, customer] = await Promise.all([
    supabaseAdmin
      .from("invoice_lines")
      .select("id, invoice_id, inventory_item_id, product_id, inventory_no, quantity, rate, amount")
      .eq("invoice_id", id),
    supabaseAdmin
      .from("payments")
      .select("id, invoice_id, amount, paid_on, mode, showroom")
      .eq("invoice_id", id)
      .order("paid_on"),
    supabaseAdmin
      .from("customers")
      .select("name, phone")
      .eq("id", invoice.customer_id)
      .maybeSingle(),
  ]);
  if (lines.error || payments.error || customer.error)
    return { error: "Could not load the bill.", status: 500 };
  const lineRows = (lines.data ?? []) as LineRow[];
  const products = await loadProducts(lineRows.map((row) => row.product_id));
  if (!products) return { error: "Could not load products.", status: 500 };
  const stockIds = lineRows.flatMap((row) =>
    row.inventory_item_id ? [row.inventory_item_id] : [],
  );
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
  const collected = round2(
    paymentRows
      .filter((payment) => !isPendingPayment(payment.mode))
      .reduce((sum, payment) => sum + payment.amount, 0),
  );
  return {
    invoice: {
      ...toSummary(invoice, customer.data?.name ?? "", total, collected),
      customerPhone: customer.data?.phone ?? "",
      lines: mapped,
      payments: paymentRows,
    },
  };
}

async function pieceAlreadyBilled(itemId: string): Promise<string[] | "error"> {
  const { data, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("invoice_id")
    .eq("inventory_item_id", itemId);
  if (error || !data) return "error";
  if (data.length === 0) return [];
  const ids = [...new Set(data.map((row) => row.invoice_id))];
  const { data: invoices, error: invoiceError } = await supabaseAdmin
    .from("invoices")
    .select("bill_no, status")
    .in("id", ids);
  if (invoiceError || !invoices) return "error";
  return invoices.filter((row) => row.status !== "cancelled").map((row) => row.bill_no);
}

async function customerRecord(id: string): Promise<{ id: string; name: string } | null | "error"> {
  const { data, error } = await supabaseAdmin
    .from("customers")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (error) return "error";
  if (!data) return null;
  return data;
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

async function loadProducts(ids: string[]): Promise<Map<string, ProductInfo> | null> {
  const unique = [...new Set(ids)];
  const catalogue = new Map<string, ProductInfo>();
  if (unique.length === 0) return catalogue;
  const products = await readIn<{
    id: string;
    group_id: string;
    code: string;
    name: string;
    unit: string;
    price: number | string;
  }>(unique, (chunk, start, end) =>
    supabaseAdmin
      .from("products")
      .select("id, group_id, code, name, unit, price")
      .in("id", chunk)
      .order("id")
      .range(start, end),
  );
  if (!products) return null;
  const groupIds = [...new Set(products.map((row) => row.group_id))];
  if (groupIds.length === 0) return catalogue;
  const groups = await readIn<{ id: string; name: string; discount_percent: number | string }>(
    groupIds,
    (chunk, start, end) =>
      supabaseAdmin
        .from("product_groups")
        .select("id, name, discount_percent")
        .in("id", chunk)
        .order("id")
        .range(start, end),
  );
  if (!groups) return null;
  const named = new Map(groups.map((group) => [group.id, group]));
  for (const row of products) {
    const group = named.get(row.group_id);
    catalogue.set(row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit === "MT" ? "MT" : "NO",
      price: Number(row.price),
      groupName: group?.name ?? "",
      discountPercent: Number(group?.discount_percent ?? 0),
    });
  }
  return catalogue;
}

async function stockStatus(ids: string[]): Promise<Map<string, string> | null> {
  const rows = await readIn<{ id: string; status: string }>(ids, (chunk, start, end) =>
    supabaseAdmin
      .from("inventory_items")
      .select("id, status")
      .in("id", chunk)
      .order("id")
      .range(start, end),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, row.status]));
}

async function customerNames(ids: string[]): Promise<Map<string, string> | null> {
  const rows = await readIn<{ id: string; name: string }>(ids, (chunk, start, end) =>
    supabaseAdmin
      .from("customers")
      .select("id, name")
      .in("id", chunk)
      .order("id")
      .range(start, end),
  );
  if (!rows) return null;
  return new Map(rows.map((row) => [row.id, row.name]));
}

function toSummary(
  row: InvoiceRow,
  customerName: string,
  total: number,
  collected: number,
  gross = total,
): InvoiceSummary {
  const net = round2(total);
  const full = round2(gross);
  return {
    id: row.id,
    billNo: row.bill_no,
    customerId: row.customer_id,
    customerName,
    billedOn: row.billed_on,
    status: paymentStatus(net, round2(collected), row.status),
    remarks: row.remarks,
    gross: full,
    discount: round2(full - net),
    total: net,
    collected: round2(collected),
    balance: round2(net - collected),
  };
}

function emptyDetail(row: InvoiceRow, customerName: string, customerPhone = ""): InvoiceDetail {
  return { ...toSummary(row, customerName, 0, 0), customerPhone, lines: [], payments: [] };
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
    discount: round2(lineAmount(Number(row.quantity), Number(row.rate)) - Number(row.amount)),
    amount: Number(row.amount),
    status,
  };
}

function toPayment(row: PaymentRow): InvoicePayment {
  const mode =
    PAYMENT_MODES.find((item) => item === row.mode) ??
    (row.mode === "MAINTENANCE" ? "MAINTENANCE" : null);
  return {
    id: row.id,
    amount: Number(row.amount),
    paidOn: row.paid_on,
    mode,
    showroom: row.showroom,
  };
}

function readRange(
  from: string | undefined,
  to: string | undefined,
): { from: string | null; to: string | null } | { error: string } {
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
