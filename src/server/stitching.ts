import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { blankToNull } from "@/lib/customers";
import {
  cleanMeasurements,
  nextOrderNo,
  stitchingOrderSchema,
  zodMessage,
  type StitchingMeasurement,
  type StitchingOrder,
  type StitchingProduct,
  type StitchingStatus,
} from "@/lib/stitching";
import { pageRange, readPage } from "@/lib/paging";
import { shopToday } from "@/lib/sales";
import { requireShop } from "@/server/guard";
import { readAll, readIn } from "@/server/read-all";

type Env = { Variables: { userId: string } };

type OrderRow = {
  id: string;
  order_no: string;
  customer_id: string;
  stitching_product_id: string | null;
  bag_no: string | null;
  ordered_on: string;
  delivery_on: string | null;
  status: string;
  amount: number | string;
};

const stitching = new Hono<Env>();
stitching.use("*", requireShop);

stitching.get("/products", async (c) => {
  const products = await loadProducts();
  if (!products) return c.json({ error: "Could not load garments." }, 500);
  return c.json({ products });
});

stitching.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const status = (c.req.query("status") ?? "").trim();
  const soon = c.req.query("due") === "soon";
  const safe = q.replace(/[%_,.()]/g, "").toLowerCase();
  const page = readPage(c.req.query("page"));
  if (q && !safe) return c.json({ orders: [], total: 0, page });
  const namedCustomers = safe
    ? await supabaseAdmin.from("customers").select("id").ilike("name", `%${safe}%`).limit(30)
    : { data: [], error: null };
  if (namedCustomers.error) return c.json({ error: "Could not search customers." }, 500);
  const customerIds = ((namedCustomers.data ?? []) as { id: string }[]).map((row) => row.id);
  const { from, to } = pageRange(page);
  const today = shopToday();
  const ranked = supabaseAdmin
    .from("stitching_orders")
    .select("id, order_no, customer_id, stitching_product_id, bag_no, ordered_on, delivery_on, status, amount", { count: "exact" });
  const filtered = soon ? ranked.eq("status", "PENDING").lte("delivery_on", plusDays(today, 7)) : status ? ranked.eq("status", status) : ranked;
  const searched = !safe
    ? filtered
    : customerIds.length > 0
      ? filtered.or(`order_no.ilike.%${safe}%,bag_no.ilike.%${safe}%,customer_id.in.(${customerIds.join(",")})`)
      : filtered.or(`order_no.ilike.%${safe}%,bag_no.ilike.%${safe}%`);
  const ordered = soon
    ? searched.order("delivery_on", { ascending: true }).order("id", { ascending: true })
    : searched.order("ordered_on", { ascending: false }).order("id", { ascending: false });
  const { data, error, count } = await ordered.range(from, to);
  if (error) return c.json({ error: "Could not load orders." }, 500);
  const rows = (data ?? []) as OrderRow[];
  const named = await withNames(rows);
  if (!named) return c.json({ error: "Could not load orders." }, 500);
  const measurements = new Map<string, StitchingMeasurement[]>();
  return c.json({
    orders: rows.map((row) => toOrder(row, named.customers, named.products, measurements)),
    total: count ?? rows.length,
    page,
  });
});

stitching.post("/", async (c) => {
  const parsed = await readOrder(c);
  if ("error" in parsed) return c.json({ error: parsed.error }, parsed.status);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const orderNo = await allocateOrderNo();
    if (!orderNo) return c.json({ error: "Could not choose an order number." }, 500);
    const { data, error } = await supabaseAdmin
      .from("stitching_orders")
      .insert({
        order_no: orderNo,
        customer_id: parsed.input.customerId,
        stitching_product_id: parsed.input.productId,
        bag_no: blankToNull(parsed.input.bagNo),
        ordered_on: parsed.input.orderedOn,
        delivery_on: parsed.deliveryOn,
        status: parsed.input.status,
        amount: parsed.input.amount,
      })
      .select("id, order_no, customer_id, stitching_product_id, bag_no, ordered_on, delivery_on, status, amount")
      .single();
    if (isDuplicate(error) && attempt === 0) continue;
    if (error || !data) return c.json({ error: "Could not save the order." }, 500);
    const saved = await replaceMeasurements(data.id, parsed.measurements);
    if (!saved) return c.json({ error: "Could not save the measurements." }, 500);
    const order = await loadOrder(data.id);
    if (!order) return c.json({ error: "Could not load the order." }, 500);
    return c.json({ order }, 201);
  }
  return c.json({ error: "Could not save the order." }, 500);
});

stitching.get("/:id", async (c) => {
  const order = await loadOrder(c.req.param("id"));
  if (!order) return c.json({ error: "Order not found." }, 404);
  return c.json({ order });
});

stitching.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const existing = await supabaseAdmin.from("stitching_orders").select("id").eq("id", id).maybeSingle();
  if (existing.error) return c.json({ error: "Could not check the order." }, 500);
  if (!existing.data) return c.json({ error: "Order not found." }, 404);
  const parsed = await readOrder(c);
  if ("error" in parsed) return c.json({ error: parsed.error }, parsed.status);
  const { error } = await supabaseAdmin
    .from("stitching_orders")
    .update({
      customer_id: parsed.input.customerId,
      stitching_product_id: parsed.input.productId,
      bag_no: blankToNull(parsed.input.bagNo),
      ordered_on: parsed.input.orderedOn,
      delivery_on: parsed.deliveryOn,
      status: parsed.input.status,
      amount: parsed.input.amount,
    })
    .eq("id", id);
  if (error) return c.json({ error: "Could not update the order." }, 500);
  const saved = await replaceMeasurements(id, parsed.measurements);
  if (!saved) return c.json({ error: "Could not save the measurements." }, 500);
  const order = await loadOrder(id);
  if (!order) return c.json({ error: "Could not load the order." }, 500);
  return c.json({ order });
});

stitching.delete("/:id", async (c) => {
  const { error } = await supabaseAdmin.from("stitching_orders").delete().eq("id", c.req.param("id"));
  if (error) return c.json({ error: "Could not remove the order." }, 500);
  return c.json({ ok: true });
});

async function readOrder(c: { req: { json: () => Promise<unknown> } }): Promise<
  { input: ReturnType<typeof stitchingOrderSchema.parse>; measurements: StitchingMeasurement[]; deliveryOn: string | null } | { error: string; status: 400 }
> {
  const parsed = stitchingOrderSchema.safeParse(await readJson(c));
  if (!parsed.success) return { error: zodMessage(parsed.error), status: 400 };
  if (parsed.data.deliveryOn && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.data.deliveryOn)) {
    return { error: "Enter a valid delivery date.", status: 400 };
  }
  const measurements = cleanMeasurements(parsed.data.measurements);
  if (typeof measurements === "string") return { error: measurements, status: 400 };
  const customer = await supabaseAdmin.from("customers").select("id").eq("id", parsed.data.customerId).maybeSingle();
  if (customer.error || !customer.data) return { error: "Choose a customer.", status: 400 };
  const product = await supabaseAdmin.from("stitching_products").select("id").eq("id", parsed.data.productId).maybeSingle();
  if (product.error || !product.data) return { error: "Choose a garment.", status: 400 };
  return { input: parsed.data, measurements, deliveryOn: parsed.data.deliveryOn || null };
}

async function loadOrder(id: string): Promise<StitchingOrder | null> {
  const { data, error } = await supabaseAdmin
    .from("stitching_orders")
    .select("id, order_no, customer_id, stitching_product_id, bag_no, ordered_on, delivery_on, status, amount")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as OrderRow;
  const named = await withNames([row]);
  if (!named) return null;
  const measurements = await loadMeasurements([row.id]);
  if (!measurements) return null;
  return toOrder(row, named.customers, named.products, measurements);
}

async function loadProducts(): Promise<StitchingProduct[] | null> {
  const { data, error } = await supabaseAdmin
    .from("stitching_products")
    .select("id, name, sort_order")
    .order("sort_order")
    .order("name");
  if (error) return null;
  const ids = (data ?? []).map((row) => row.id);
  const fields = ids.length
    ? await supabaseAdmin
        .from("stitching_measurement_fields")
        .select("id, stitching_product_id, label, sort_order")
        .in("stitching_product_id", ids)
        .order("sort_order")
    : { data: [], error: null };
  if (fields.error) return null;
  const grouped = new Map<string, StitchingProduct["measurements"]>();
  for (const field of fields.data ?? []) {
    const list = grouped.get(field.stitching_product_id) ?? [];
    list.push({ id: field.id, label: field.label, sortOrder: field.sort_order });
    grouped.set(field.stitching_product_id, list);
  }
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, measurements: grouped.get(row.id) ?? [] }));
}

function plusDays(iso: string, days: number): string {
  const [year, month, date] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1));
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function withNames(rows: OrderRow[]): Promise<{ customers: Map<string, string>; products: Map<string, string> } | null> {
  const customerIds = [...new Set(rows.map((row) => row.customer_id))];
  const productIds = [...new Set(rows.flatMap((row) => (row.stitching_product_id ? [row.stitching_product_id] : [])))];
  const customers = await readIn<{ id: string; name: string }>(customerIds, (chunk, from, to) =>
    supabaseAdmin.from("customers").select("id, name").in("id", chunk).order("id").range(from, to),
  );
  const products = await readIn<{ id: string; name: string }>(productIds, (chunk, from, to) =>
    supabaseAdmin.from("stitching_products").select("id, name").in("id", chunk).order("id").range(from, to),
  );
  if (!customers || !products) return null;
  return {
    customers: new Map(customers.map((row) => [row.id, row.name])),
    products: new Map(products.map((row) => [row.id, row.name])),
  };
}

async function loadMeasurements(ids: string[]): Promise<Map<string, StitchingMeasurement[]> | null> {
  if (ids.length === 0) return new Map();
  const data = await readIn<{ order_id: string; label: string; value: string; sort_order: number }>(ids, (chunk, from, to) =>
    supabaseAdmin
      .from("stitching_order_measurements")
      .select("order_id, label, value, sort_order")
      .in("order_id", chunk)
      .order("sort_order")
      .order("id")
      .range(from, to),
  );
  if (!data) return null;
  const grouped = new Map<string, StitchingMeasurement[]>();
  for (const row of data) {
    const list = grouped.get(row.order_id) ?? [];
    list.push({ label: row.label, value: row.value });
    grouped.set(row.order_id, list);
  }
  return grouped;
}

async function replaceMeasurements(orderId: string, measurements: StitchingMeasurement[]): Promise<boolean> {
  const removed = await supabaseAdmin.from("stitching_order_measurements").delete().eq("order_id", orderId);
  if (removed.error) return false;
  if (measurements.length === 0) return true;
  const { error } = await supabaseAdmin.from("stitching_order_measurements").insert(
    measurements.map((row, index) => ({
      order_id: orderId,
      label: row.label,
      value: row.value,
      sort_order: index + 1,
    })),
  );
  return !error;
}

async function allocateOrderNo(): Promise<string | null> {
  const loaded = await readAll<{ order_no: string }>((from, to) =>
    supabaseAdmin.from("stitching_orders").select("order_no").order("id").range(from, to),
  );
  if (!loaded) return null;
  return nextOrderNo(loaded.rows.map((row) => row.order_no));
}

function toOrder(
  row: OrderRow,
  customers: Map<string, string>,
  products: Map<string, string>,
  measurements: Map<string, StitchingMeasurement[]>,
): StitchingOrder {
  return {
    id: row.id,
    orderNo: row.order_no,
    customerId: row.customer_id,
    customerName: customers.get(row.customer_id) ?? "",
    productId: row.stitching_product_id ?? "",
    productName: row.stitching_product_id ? (products.get(row.stitching_product_id) ?? "") : "",
    bagNo: row.bag_no,
    orderedOn: row.ordered_on,
    deliveryOn: row.delivery_on,
    status: isStatus(row.status) ? row.status : "PENDING",
    amount: Number(row.amount),
    measurements: measurements.get(row.id) ?? [],
  };
}

function isStatus(value: string): value is StitchingStatus {
  return value === "PENDING" || value === "READY" || value === "DELIVERED";
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

export { stitching as stitchingRoutes };
