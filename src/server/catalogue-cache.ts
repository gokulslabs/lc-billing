import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readAll } from "@/server/read-all";

export type CatalogueGroup = {
  id: string;
  name: string;
  code: string;
  discountPercent: number;
  productCount: number;
};

export type CatalogueProduct = {
  id: string;
  groupId: string;
  groupName: string;
  groupCode: string;
  discountPercent: number;
  code: string;
  name: string;
  unit: "NO" | "MT";
  price: number;
};

type GroupRow = { id: string; name: string; code: string; discount_percent: number | string };
type ProductRow = {
  id: string;
  group_id: string;
  code: string;
  name: string;
  unit: string;
  price: number | string;
};

const TTL_MS = 30_000;
let cachedAt = 0;
let cached: { groups: CatalogueGroup[]; products: CatalogueProduct[] } | null = null;
let revision = 0;
let pending: {
  revision: number;
  promise: Promise<{ groups: CatalogueGroup[]; products: CatalogueProduct[] } | null>;
} | null = null;

export function invalidateCatalogueCache(): void {
  revision += 1;
  cachedAt = 0;
  cached = null;
  pending = null;
}

export async function getCatalogue(): Promise<{
  groups: CatalogueGroup[];
  products: CatalogueProduct[];
} | null> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (pending?.revision === revision) return pending.promise;

  const currentRevision = revision;
  const promise = loadCatalogue();
  pending = { revision: currentRevision, promise };
  try {
    const loaded = await promise;
    if (loaded && revision === currentRevision) {
      cached = loaded;
      cachedAt = Date.now();
    }
    return loaded;
  } finally {
    if (pending?.promise === promise) pending = null;
  }
}

async function loadCatalogue(): Promise<{
  groups: CatalogueGroup[];
  products: CatalogueProduct[];
} | null> {
  const [groupRows, productRows] = await Promise.all([
    readAll<GroupRow>((from, to) =>
      supabaseAdmin
        .from("product_groups")
        .select("id, name, code, discount_percent")
        .order("id")
        .range(from, to),
    ),
    readAll<ProductRow>((from, to) =>
      supabaseAdmin
        .from("products")
        .select("id, group_id, code, name, unit, price")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (!groupRows || !productRows) return null;

  const groupMap = new Map<string, CatalogueGroup>();
  for (const row of groupRows.rows) {
    groupMap.set(row.id, {
      id: row.id,
      name: row.name,
      code: row.code,
      discountPercent: Number(row.discount_percent),
      productCount: 0,
    });
  }

  const products = productRows.rows.map((row): CatalogueProduct => {
    const group = groupMap.get(row.group_id);
    if (group) group.productCount += 1;
    return {
      id: row.id,
      groupId: row.group_id,
      groupName: group?.name ?? "",
      groupCode: group?.code ?? "",
      discountPercent: group?.discountPercent ?? 0,
      code: row.code,
      name: row.name,
      unit: row.unit === "MT" ? "MT" : "NO",
      price: Number(row.price),
    };
  });
  return { groups: [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name)), products };
}
