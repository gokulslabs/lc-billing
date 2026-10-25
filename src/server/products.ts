import { Hono } from "hono";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  nextProductCode,
  productGroupSchema,
  productSchema,
  zodMessage,
  type Product,
  type ProductGroup,
  type Unit,
} from "@/lib/products";
import { PAGE_SIZE, pageRange, readPage } from "@/lib/paging";
import { requireShop } from "@/server/guard";
import { readAll } from "@/server/read-all";

type Env = { Variables: { userId: string } };

type GroupRow = {
  id: string;
  name: string;
  code: string;
  discount_percent: number | string;
};

type ProductRow = {
  id: string;
  group_id: string;
  code: string;
  name: string;
  unit: string;
  price: number | string;
};

const groups = new Hono<Env>();
const products = new Hono<Env>();
groups.use("*", requireShop);
products.use("*", requireShop);

groups.get("/", async (c) => {
  const loaded = await loadGroups();
  if ("error" in loaded) return c.json({ error: loaded.error }, 500);
  return c.json({ groups: loaded.groups });
});

groups.post("/", async (c) => {
  const parsed = productGroupSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const { data, error } = await supabaseAdmin
    .from("product_groups")
    .insert({
      name: parsed.data.name,
      code: parsed.data.code,
      discount_percent: parsed.data.discountPercent,
    })
    .select("id, name, code, discount_percent")
    .single();
  if (error || !data) return c.json({ error: "Could not save the group." }, 500);
  return c.json({ group: toGroup(data as GroupRow, 0) }, 201);
});

groups.patch("/:id", async (c) => {
  const parsed = productGroupSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const id = c.req.param("id");
  const { data, error } = await supabaseAdmin
    .from("product_groups")
    .update({
      name: parsed.data.name,
      code: parsed.data.code,
      discount_percent: parsed.data.discountPercent,
    })
    .eq("id", id)
    .select("id, name, code, discount_percent")
    .maybeSingle();
  if (error) return c.json({ error: "Could not update the group." }, 500);
  if (!data) return c.json({ error: "Group not found." }, 404);
  const counts = await productCounts();
  if (!counts) return c.json({ error: "Could not count products." }, 500);
  return c.json({ group: toGroup(data as GroupRow, counts.get(id) ?? 0) });
});

groups.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const { count, error: countError } = await supabaseAdmin
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("group_id", id);
  if (countError) return c.json({ error: "Could not check the group." }, 500);
  if ((count ?? 0) > 0) return c.json({ error: "Move or remove the products in this group first." }, 400);
  const { error } = await supabaseAdmin.from("product_groups").delete().eq("id", id);
  if (error) return c.json({ error: "Could not remove the group." }, 500);
  return c.json({ ok: true });
});

products.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 80);
  const groupId = c.req.query("groupId") ?? "";
  const groups = await loadGroups();
  if ("error" in groups) return c.json({ error: groups.error }, 500);
  const byId = new Map(groups.groups.map((group) => [group.id, group]));

  const safe = q.replace(/[%_,]/g, "");
  const picker = c.req.query("picker") === "1";
  if (picker) {
    const loaded = await readAll<ProductRow>((from, to) => {
      const ranked = supabaseAdmin.from("products").select("id, group_id, code, name, unit, price").order("name").order("id");
      const grouped = groupId ? ranked.eq("group_id", groupId) : ranked;
      const filtered = safe ? grouped.or(`name.ilike.%${safe}%,code.ilike.%${safe}%`) : grouped;
      return filtered.range(from, to);
    });
    if (!loaded) return c.json({ error: "Could not load products." }, 500);
    const rows = loaded.rows.flatMap((row) => {
      const group = byId.get(row.group_id);
      return group ? [toProduct(row, group)] : [];
    });
    return c.json({ products: rows, total: rows.length, page: 1, pageSize: rows.length });
  }

  const page = readPage(c.req.query("page"));
  const { from, to } = pageRange(page);
  const ranked = supabaseAdmin.from("products").select("id, group_id, code, name, unit, price", { count: "exact" }).order("name").order("id");
  const grouped = groupId ? ranked.eq("group_id", groupId) : ranked;
  const filtered = safe ? grouped.or(`name.ilike.%${safe}%,code.ilike.%${safe}%`) : grouped;
  const { data, error, count } = await filtered.range(from, to);
  if (error) return c.json({ error: "Could not load products." }, 500);

  const rows = ((data ?? []) as ProductRow[]).flatMap((row) => {
    const group = byId.get(row.group_id);
    if (!group) return [];
    return [toProduct(row, group)];
  });
  return c.json({ products: rows, total: count ?? rows.length, page, pageSize: PAGE_SIZE });
});

products.post("/", async (c) => {
  const parsed = productSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const group = await findGroup(parsed.data.groupId);
  if (!group) return c.json({ error: "Choose a product group." }, 400);

  const code = parsed.data.code || (await generatedCode(group));
  if (!code) return c.json({ error: "Could not create a product code." }, 500);
  const saved = await insertProduct({ ...parsed.data, code }, group);
  if ("error" in saved) return c.json({ error: saved.error }, saved.status);
  return c.json({ product: saved.product }, 201);
});

products.patch("/:id", async (c) => {
  const parsed = productSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  if (!parsed.data.code) return c.json({ error: "Enter a product code." }, 400);
  const id = c.req.param("id");
  const group = await findGroup(parsed.data.groupId);
  if (!group) return c.json({ error: "Choose a product group." }, 400);

  const { data, error } = await supabaseAdmin
    .from("products")
    .update({
      group_id: parsed.data.groupId,
      code: parsed.data.code,
      name: parsed.data.name,
      unit: parsed.data.unit,
      price: parsed.data.price,
    })
    .eq("id", id)
    .select("id, group_id, code, name, unit, price")
    .maybeSingle();
  if (isDuplicate(error)) return c.json({ error: "That product code is already used." }, 400);
  if (error) return c.json({ error: "Could not update the product." }, 500);
  if (!data) return c.json({ error: "Product not found." }, 404);
  return c.json({ product: toProduct(data as ProductRow, group) });
});

products.delete("/:id", async (c) => {
  const { error } = await supabaseAdmin.from("products").delete().eq("id", c.req.param("id"));
  if (error) return c.json({ error: "Could not remove the product." }, 500);
  return c.json({ ok: true });
});

export { groups as productGroupRoutes, products as productRoutes };

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

async function loadGroups(): Promise<{ groups: ProductGroup[] } | { error: string }> {
  const loaded = await readAll<GroupRow>((from, to) =>
    supabaseAdmin.from("product_groups").select("id, name, code, discount_percent").order("name").order("id").range(from, to),
  );
  if (!loaded) return { error: "Could not load groups." };
  const counts = await productCounts();
  if (!counts) return { error: "Could not count products." };
  return { groups: loaded.rows.map((row) => toGroup(row, counts.get(row.id) ?? 0)) };
}

async function productCounts(): Promise<Map<string, number> | null> {
  const loaded = await readAll<{ group_id: string }>((from, to) =>
    supabaseAdmin.from("products").select("group_id").order("id").range(from, to),
  );
  if (!loaded) return null;
  const counts = new Map<string, number>();
  for (const row of loaded.rows) {
    counts.set(row.group_id, (counts.get(row.group_id) ?? 0) + 1);
  }
  return counts;
}

async function findGroup(id: string): Promise<ProductGroup | null> {
  const { data, error } = await supabaseAdmin
    .from("product_groups")
    .select("id, name, code, discount_percent")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return toGroup(data as GroupRow, 0);
}

async function generatedCode(group: ProductGroup): Promise<string | null> {
  const loaded = await readAll<{ code: string }>((from, to) =>
    supabaseAdmin.from("products").select("code").eq("group_id", group.id).order("id").range(from, to),
  );
  if (!loaded) return null;
  return nextProductCode(
    group.code,
    loaded.rows.map((row) => row.code),
  );
}

async function insertProduct(
  input: { groupId: string; name: string; code: string; unit: Unit; price: number },
  group: ProductGroup,
): Promise<{ product: Product } | { error: string; status: 400 | 500 }> {
  const { data, error } = await supabaseAdmin
    .from("products")
    .insert({
      group_id: input.groupId,
      code: input.code,
      name: input.name,
      unit: input.unit,
      price: input.price,
    })
    .select("id, group_id, code, name, unit, price")
    .single();
  if (isDuplicate(error)) return { error: "That product code is already used.", status: 400 };
  if (error || !data) return { error: "Could not save the product.", status: 500 };
  return { product: toProduct(data as ProductRow, group) };
}

function isDuplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function money(value: number | string): number {
  return Number(value);
}

function toGroup(row: GroupRow, productCount: number): ProductGroup {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    discountPercent: money(row.discount_percent),
    productCount,
  };
}

function toProduct(row: ProductRow, group: ProductGroup): Product {
  return {
    id: row.id,
    groupId: row.group_id,
    groupName: group.name,
    groupCode: group.code,
    discountPercent: group.discountPercent,
    code: row.code,
    name: row.name,
    unit: row.unit === "MT" ? "MT" : "NO",
    price: money(row.price),
  };
}
