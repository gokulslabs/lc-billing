import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  barcodeNumbers,
  barcodeSchema,
  groupPurchases,
  inventoryUpdateSchema,
  stockReceiptSchema,
  kolkataBounds,
  nextInventoryNo,
  quantityForUnit,
  slipPlan,
  zodMessage,
  type InventoryItem,
  type PurchaseRow,
} from "@/lib/inventory";
import { lineAmount, shopToday } from "@/lib/sales";
import type { Unit } from "@/lib/products";
import { requireShop } from "@/server/guard";
import { pageRange, readPage } from "@/lib/paging";
import { readAll } from "@/server/read-all";

type Env = { Variables: { userId: string } };

type ItemRow = {
  id: string;
  inventory_no: string;
  product_id: string;
  quantity: number | string;
  status: string;
};

type CatalogueProduct = {
  id: string;
  code: string;
  name: string;
  unit: Unit;
  price: number;
  groupId: string;
  groupName: string;
};

const inventory = new Hono<Env>();
inventory.use("*", requireShop);

inventory.get("/barcodes", (c) => {
  const parsed = barcodeSchema.safeParse({
    starting: c.req.query("starting") ?? "",
    quantity: Number(c.req.query("quantity")),
  });
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const numbers = barcodeNumbers(parsed.data.starting, parsed.data.quantity);
  if (numbers.length !== parsed.data.quantity) return c.json({ error: "Enter an inventory number such as IN0021288." }, 400);
  return c.json({ numbers });
});

inventory.get("/purchases", async (c) => {
  const from = c.req.query("from") || shopToday();
  const to = c.req.query("to") || from;
  const bounds = kolkataBounds(from, to);
  if (!bounds) return c.json({ error: "Enter a from date and a to date." }, 400);
  const catalogue = await loadCatalogue();
  if (!catalogue) return c.json({ error: "Could not load products." }, 500);

  const loaded = await readAll<{
    inventory_no: string;
    product_id: string;
    received_quantity: number | string;
    created_at: string;
    supplier_name: string | null;
    supplier_bill_no: string | null;
    cost: number | string | null;
  }>(
    (from, to) =>
      supabaseAdmin
        .from("inventory_items")
        .select("inventory_no, product_id, received_quantity, created_at, supplier_name, supplier_bill_no, cost")
        .gte("created_at", bounds.start)
        .lt("created_at", bounds.end)
        .order("created_at")
        .order("id")
        .range(from, to),
  );
  if (!loaded) return c.json({ error: "Could not load purchases." }, 500);
  const rows = loaded.rows;
  const purchases = groupPurchases(
    rows.map(
      (row): PurchaseRow => ({
        createdAt: row.created_at,
        inventoryNo: row.inventory_no,
        productId: row.product_id,
        quantity: Number(row.received_quantity),
        supplierName: row.supplier_name ?? "",
        supplierBillNo: row.supplier_bill_no ?? "",
        cost: row.cost == null ? null : Number(row.cost),
      }),
    ),
    catalogue,
  );
  return c.json({ purchases, truncated: loaded.truncated });
});

inventory.get("/summary", async (c) => {
  const catalogue = await loadCatalogue();
  if (!catalogue) return c.json({ error: "Could not load products." }, 500);
  const loaded = await readAll<{ product_id: string; quantity: number | string }>((from, to) =>
    supabaseAdmin
      .from("inventory_items")
      .select("product_id, quantity")
      .eq("status", "available")
      .order("id")
      .range(from, to),
  );
  if (!loaded) return c.json({ error: "Could not load current stock." }, 500);

  const groups = new Map<string, { id: string; name: string; quantity: number; amount: number }>();
  let quantity = 0;
  let slips = 0;
  for (const row of loaded.rows) {
    const product = catalogue.get(row.product_id);
    if (!product) continue;
    const rowQuantity = Number(row.quantity);
    slips += 1;
    quantity = Math.round((quantity + rowQuantity) * 1000) / 1000;
    const current = groups.get(product.groupId) ?? { id: product.groupId, name: product.groupName, quantity: 0, amount: 0 };
    current.quantity = Math.round((current.quantity + rowQuantity) * 1000) / 1000;
    current.amount = Math.round((current.amount + lineAmount(rowQuantity, product.price)) * 100) / 100;
    groups.set(product.groupId, current);
  }
  const summary = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  return c.json({ groups: summary, slips, quantity });
});

inventory.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const groupId = c.req.query("groupId") ?? "";
  const productId = c.req.query("productId") ?? "";
  const availableOnly = c.req.query("available") === "1";
  const page = readPage(c.req.query("page"));
  const catalogue = await loadCatalogue();
  if (!catalogue) return c.json({ error: "Could not load products." }, 500);

  const allowed = productFilter(catalogue, groupId, productId);
  if (allowed && allowed.length === 0) return c.json({ items: [], total: 0, page });
  const safe = q.replace(/[%_,.()]/g, "").toLowerCase();
  if (q && !safe) return c.json({ items: [], total: 0, page });
  const nameMatches = safe
    ? [...catalogue.values()]
        .filter((product) => matches(product, safe) && (!allowed || allowed.includes(product.id)))
        .slice(0, 40)
        .map((product) => product.id)
    : [];

  const { from, to } = pageRange(page);
  const selected = supabaseAdmin
    .from("inventory_items")
    .select("id, inventory_no, product_id, quantity, status", { count: "exact" });
  const statused = availableOnly ? selected.eq("status", "available") : selected;
  const scoped = allowed ? statused.in("product_id", allowed) : statused;
  const searched = !safe
    ? scoped
    : nameMatches.length > 0
      ? scoped.or(`inventory_no.ilike.%${safe}%,product_id.in.(${nameMatches.join(",")})`)
      : scoped.ilike("inventory_no", `%${safe}%`);
  const { data, error, count } = await searched
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) return c.json({ error: "Could not load stock." }, 500);
  const rows = ((data ?? []) as ItemRow[]).flatMap((row) => {
    const product = catalogue.get(row.product_id);
    return product ? [toItem(row, product)] : [];
  });
  return c.json({ items: rows, total: count ?? rows.length, page });
});

inventory.post("/", async (c) => {
  const parsed = stockReceiptSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const catalogue = await loadCatalogue();
  const product = catalogue?.get(parsed.data.productId);
  if (!product) return c.json({ error: "Choose a product." }, 400);
  const quantityError = quantityForUnit(product.unit, parsed.data.quantity);
  if (quantityError) return c.json({ error: quantityError }, 400);

  const requested = parsed.data.inventoryNo ?? "";
  const plan = slipPlan(product.unit, parsed.data.quantity, requested);
  if (typeof plan === "string") return c.json({ error: plan }, 400);
  const numbers = requested.trim() ? [requested.trim()] : await allocateRun(plan.count);
  if (!numbers) return c.json({ error: "Could not choose an inventory number." }, 500);

  const generated = requested.trim().length === 0;
  const items: InventoryItem[] = [];
  for (const inventoryNo of numbers) {
    const saved = await insertSlip(product, inventoryNo, plan.each, parsed.data, generated);
    if ("error" in saved) return c.json({ error: saved.error }, saved.status);
    items.push(saved.item);
  }
  const first = items[0];
  if (!first) return c.json({ error: "Could not add stock." }, 500);
  return c.json({ item: first, items }, 201);
});

inventory.patch("/:id", async (c) => {
  const parsed = inventoryUpdateSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const id = c.req.param("id");
  const catalogue = await loadCatalogue();
  const product = catalogue?.get(parsed.data.productId);
  if (!product) return c.json({ error: "Choose a product." }, 400);
  const quantityError = quantityForUnit(product.unit, parsed.data.quantity);
  if (quantityError) return c.json({ error: quantityError }, 400);
  if (!parsed.data.inventoryNo) return c.json({ error: "Enter an inventory number." }, 400);

  const used = await lineCount(id);
  if (used === null) return c.json({ error: "Could not check this stock row." }, 500);
  if (used > 0) {
    const current = await supabaseAdmin
      .from("inventory_items")
      .select("inventory_no, product_id, quantity")
      .eq("id", id)
      .maybeSingle();
    if (current.error) return c.json({ error: "Could not check this stock row." }, 500);
    if (!current.data) return c.json({ error: "Stock row not found." }, 404);
    const sameQuantity = Math.abs(Number(current.data.quantity) - parsed.data.quantity) <= 0.0001;
    if (current.data.inventory_no !== parsed.data.inventoryNo || current.data.product_id !== product.id || !sameQuantity) {
      return c.json({ error: "This number is already on a bill. Change the quantity from the bill." }, 400);
    }
  }

  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .update({
      inventory_no: parsed.data.inventoryNo,
      product_id: product.id,
      quantity: parsed.data.quantity,
      status: parsed.data.quantity > 0 ? "available" : "sold",
      ...(used === 0 ? { received_quantity: parsed.data.quantity } : {}),
      ...(parsed.data.supplierName ? { supplier_name: parsed.data.supplierName } : {}),
      ...(parsed.data.supplierBillNo ? { supplier_bill_no: parsed.data.supplierBillNo } : {}),
      ...(parsed.data.cost !== undefined ? { cost: parsed.data.cost } : {}),
    })
    .eq("id", id)
    .select("id, inventory_no, product_id, quantity, status")
    .maybeSingle();
  if (isDuplicate(error)) return c.json({ error: "That inventory number is already used." }, 400);
  if (error) return c.json({ error: "Could not update stock." }, 500);
  if (!data) return c.json({ error: "Stock row not found." }, 404);
  return c.json({ item: toItem(data as ItemRow, product) });
});

inventory.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const used = await lineCount(id);
  if (used === null) return c.json({ error: "Could not check this stock row." }, 500);
  if (used > 0) return c.json({ error: "This number is already on a bill." }, 400);
  const { error } = await supabaseAdmin.from("inventory_items").delete().eq("id", id);
  if (error) return c.json({ error: "Could not remove this stock row." }, 500);
  return c.json({ ok: true });
});

async function loadCatalogue(): Promise<Map<string, CatalogueProduct> | null> {
  const groups = await readAll<{ id: string; name: string }>((from, to) =>
    supabaseAdmin.from("product_groups").select("id, name").order("id").range(from, to),
  );
  if (!groups) return null;
  const names = new Map(groups.rows.map((group) => [group.id, group.name]));
  const products = await readAll<{ id: string; group_id: string; code: string; name: string; unit: string; price: number | string }>(
    (from, to) => supabaseAdmin.from("products").select("id, group_id, code, name, unit, price").order("id").range(from, to),
  );
  if (!products) return null;
  const catalogue = new Map<string, CatalogueProduct>();
  for (const row of products.rows) {
    catalogue.set(row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      unit: row.unit === "MT" ? "MT" : "NO",
      price: Number(row.price),
      groupId: row.group_id,
      groupName: names.get(row.group_id) ?? "",
    });
  }
  return catalogue;
}

function productFilter(catalogue: Map<string, CatalogueProduct>, groupId: string, productId: string): string[] | null {
  if (productId) return [productId];
  if (!groupId) return null;
  return [...catalogue.values()].filter((product) => product.groupId === groupId).map((product) => product.id);
}

function matches(product: CatalogueProduct, q: string): boolean {
  const needle = q.toLowerCase();
  return product.name.toLowerCase().includes(needle) || product.code.toLowerCase().includes(needle);
}

async function insertSlip(
  product: CatalogueProduct,
  inventoryNo: string,
  quantity: number,
  receipt: { supplierName: string; supplierBillNo: string; cost: number },
  generated: boolean,
): Promise<{ item: InventoryItem } | { error: string; status: 400 | 500 }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const number = attempt === 0 ? inventoryNo : await allocateNo();
    if (!number) return { error: "Could not choose an inventory number.", status: 500 };
    const { data, error } = await supabaseAdmin
      .from("inventory_items")
      .insert({
        inventory_no: number,
        product_id: product.id,
        quantity,
        received_quantity: quantity,
        status: "available",
        supplier_name: receipt.supplierName,
        supplier_bill_no: receipt.supplierBillNo,
        cost: receipt.cost,
      })
      .select("id, inventory_no, product_id, quantity, status")
      .single();
    if (isDuplicate(error)) {
      if (generated && attempt === 0) continue;
      return { error: "That inventory number is already used.", status: 400 };
    }
    if (error || !data) return { error: "Could not add stock.", status: 500 };
    return { item: toItem(data as ItemRow, product) };
  }
  return { error: "Could not add stock.", status: 500 };
}

async function allocateRun(count: number): Promise<string[] | null> {
  const first = await allocateNo();
  if (!first) return null;
  const numbers = [first];
  let last = first;
  for (let index = 1; index < count; index += 1) {
    last = nextInventoryNo([last]);
    numbers.push(last);
  }
  return numbers;
}

async function allocateNo(): Promise<string | null> {
  const loaded = await readAll<{ inventory_no: string }>((from, to) =>
    supabaseAdmin.from("inventory_items").select("inventory_no").order("id").range(from, to),
  );
  if (!loaded) return null;
  return nextInventoryNo(loaded.rows.map((row) => row.inventory_no));
}

async function lineCount(id: string): Promise<number | null> {
  const { count, error } = await supabaseAdmin
    .from("invoice_lines")
    .select("id", { count: "exact", head: true })
    .eq("inventory_item_id", id);
  if (error) return null;
  return count ?? 0;
}

function isDuplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function toItem(row: ItemRow, product: CatalogueProduct): InventoryItem {
  return {
    id: row.id,
    inventoryNo: row.inventory_no,
    productId: product.id,
    productCode: product.code,
    productName: product.name,
    groupName: product.groupName,
    unit: product.unit,
    price: product.price,
    quantity: Number(row.quantity),
    status: row.status,
  };
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export { inventory as inventoryRoutes };
