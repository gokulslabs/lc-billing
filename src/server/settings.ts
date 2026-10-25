import { Hono } from "hono";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { nextSortOrder, shopName, type StitchingGarment, type StitchingHead, type StitchingProcess } from "@/lib/settings";
import { zodMessage } from "@/lib/stitching";
import { requireShop } from "@/server/guard";

type Env = { Variables: { userId: string } };

type GarmentRow = { id: string; name: string; sort_order: number };
type HeadRow = { id: string; stitching_product_id: string; label: string; sort_order: number };
type ProcessRow = { id: string; name: string; sort_order: number };

const nameSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(40, "Name is too long."),
});

const headSchema = z.object({
  productId: z.string().uuid("Choose a garment."),
  label: z.string().trim().min(1, "Enter a measurement head.").max(40, "Measurement head is too long."),
});

const settings = new Hono<Env>();
settings.use("*", requireShop);

settings.get("/", async (c) => {
  const loaded = await loadSettings();
  if (!loaded) return c.json({ error: "Could not load settings." }, 500);
  return c.json(loaded);
});

settings.post("/garments", async (c) => {
  const parsed = nameSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const name = shopName(parsed.data.name);
  if (!name) return c.json({ error: "Enter a garment name." }, 400);

  const sortOrder = await nextOrder("stitching_products");
  if (sortOrder == null) return c.json({ error: "Could not save the garment." }, 500);
  const { data, error } = await supabaseAdmin
    .from("stitching_products")
    .insert({ name, sort_order: sortOrder })
    .select("id, name, sort_order")
    .single();
  if (isDuplicate(error)) return c.json({ error: "That garment already exists." }, 400);
  if (error || !data) return c.json({ error: "Could not save the garment." }, 500);
  return c.json({ garment: toGarment(data as GarmentRow, []) }, 201);
});

settings.delete("/garments/:id", async (c) => {
  const id = c.req.param("id");
  const orders = await supabaseAdmin
    .from("stitching_orders")
    .select("id", { count: "exact", head: true })
    .eq("stitching_product_id", id);
  if (orders.error) return c.json({ error: "Could not check this garment." }, 500);
  if ((orders.count ?? 0) > 0) return c.json({ error: "This garment is on a stitching order." }, 400);

  const { error } = await supabaseAdmin.from("stitching_products").delete().eq("id", id);
  if (isRestrict(error)) return c.json({ error: "This garment is on a stitching order." }, 400);
  if (error) return c.json({ error: "Could not remove the garment." }, 500);
  return c.json({ ok: true });
});

settings.post("/processes", async (c) => {
  const parsed = nameSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const name = shopName(parsed.data.name);
  if (!name) return c.json({ error: "Enter a process name." }, 400);

  const sortOrder = await nextOrder("stitching_processes");
  if (sortOrder == null) return c.json({ error: "Could not save the process." }, 500);
  const { data, error } = await supabaseAdmin
    .from("stitching_processes")
    .insert({ name, sort_order: sortOrder })
    .select("id, name, sort_order")
    .single();
  if (isDuplicate(error)) return c.json({ error: "That process already exists." }, 400);
  if (error || !data) return c.json({ error: "Could not save the process." }, 500);
  return c.json({ process: toProcess(data as ProcessRow) }, 201);
});

settings.delete("/processes/:id", async (c) => {
  const { error } = await supabaseAdmin.from("stitching_processes").delete().eq("id", c.req.param("id"));
  if (error) return c.json({ error: "Could not remove the process." }, 500);
  return c.json({ ok: true });
});

settings.post("/measurements", async (c) => {
  const parsed = headSchema.safeParse(await readJson(c));
  if (!parsed.success) return c.json({ error: zodMessage(parsed.error) }, 400);
  const label = shopName(parsed.data.label);
  if (!label) return c.json({ error: "Enter a measurement head." }, 400);

  const garment = await supabaseAdmin.from("stitching_products").select("id").eq("id", parsed.data.productId).maybeSingle();
  if (garment.error) return c.json({ error: "Could not check the garment." }, 500);
  if (!garment.data) return c.json({ error: "Choose a garment." }, 400);

  const existing = await supabaseAdmin
    .from("stitching_measurement_fields")
    .select("sort_order")
    .eq("stitching_product_id", parsed.data.productId);
  if (existing.error) return c.json({ error: "Could not save the measurement head." }, 500);
  const sortOrder = nextSortOrder((existing.data ?? []).map((row) => row.sort_order));

  const { data, error } = await supabaseAdmin
    .from("stitching_measurement_fields")
    .insert({ stitching_product_id: parsed.data.productId, label, sort_order: sortOrder })
    .select("id, label, sort_order")
    .single();
  if (isDuplicate(error)) return c.json({ error: "That measurement head already exists." }, 400);
  if (error || !data) return c.json({ error: "Could not save the measurement head." }, 500);
  return c.json({ measurement: toHead(data as Pick<HeadRow, "id" | "label" | "sort_order">) }, 201);
});

settings.delete("/measurements/:id", async (c) => {
  const { error } = await supabaseAdmin.from("stitching_measurement_fields").delete().eq("id", c.req.param("id"));
  if (error) return c.json({ error: "Could not remove the measurement head." }, 500);
  return c.json({ ok: true });
});

async function loadSettings(): Promise<{ garments: StitchingGarment[]; processes: StitchingProcess[] } | null> {
  const [garments, fields, processes] = await Promise.all([
    supabaseAdmin.from("stitching_products").select("id, name, sort_order").order("sort_order").order("name"),
    supabaseAdmin
      .from("stitching_measurement_fields")
      .select("id, stitching_product_id, label, sort_order")
      .order("sort_order"),
    supabaseAdmin.from("stitching_processes").select("id, name, sort_order").order("sort_order").order("name"),
  ]);
  if (garments.error || fields.error || processes.error) return null;
  const grouped = new Map<string, StitchingHead[]>();
  for (const field of (fields.data ?? []) as HeadRow[]) {
    const list = grouped.get(field.stitching_product_id) ?? [];
    list.push(toHead(field));
    grouped.set(field.stitching_product_id, list);
  }
  return {
    garments: ((garments.data ?? []) as GarmentRow[]).map((row) => toGarment(row, grouped.get(row.id) ?? [])),
    processes: ((processes.data ?? []) as ProcessRow[]).map(toProcess),
  };
}

async function nextOrder(table: "stitching_products" | "stitching_processes"): Promise<number | null> {
  const { data, error } = await supabaseAdmin.from(table).select("sort_order").order("sort_order", { ascending: false }).limit(1);
  if (error) return null;
  return nextSortOrder((data ?? []).map((row) => row.sort_order));
}

function toGarment(row: GarmentRow, measurements: StitchingHead[]): StitchingGarment {
  return { id: row.id, name: row.name, sortOrder: row.sort_order, measurements };
}

function toHead(row: Pick<HeadRow, "id" | "label" | "sort_order">): StitchingHead {
  return { id: row.id, label: row.label, sortOrder: row.sort_order };
}

function toProcess(row: ProcessRow): StitchingProcess {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

function isDuplicate(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function isRestrict(error: { code?: string } | null): boolean {
  return error?.code === "23503";
}

async function readJson(c: { req: { json: () => Promise<unknown> } }): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return null;
  }
}

export { settings as settingsRoutes };
