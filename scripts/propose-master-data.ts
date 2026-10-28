import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { correctedSpelling } from "../src/lib/settings";

const apply = process.argv.includes("--apply");

function envValue(file: string, name: string): string {
  const text = readFileSync(file, "utf8");
  const line = text.split("\n").find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim().replace(/^"|"$/g, "") ?? "";
}

async function renameRows(
  supabase: SupabaseClient,
  table: string,
  column: "name" | "label",
): Promise<number> {
  const { data, error } = await supabase.from(table).select(`id, ${column}`);
  if (error) throw new Error(`${table}: ${error.message}`);
  let changed = 0;
  for (const row of data ?? []) {
    const current = String(row[column] ?? "");
    const next = correctedSpelling(current);
    if (next === current) continue;
    if (!apply) {
      changed += 1;
      continue;
    }
    const { error: updateError } = await supabase.from(table).update({ [column]: next }).eq("id", row.id);
    if (updateError) throw new Error(`${table} ${row.id}: ${updateError.message}`);
    changed += 1;
  }
  return changed;
}

async function main() {
  const url = envValue(".env", "VITE_SUPABASE_URL") || envValue(".env", "SUPABASE_URL");
  const key = envValue(".env.local", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase URL or service role key.");
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const groups = await supabase.from("product_groups").select("id, name, code");
  if (groups.error) throw new Error(groups.error.message);
  const byCode = new Map<string, string[]>();
  for (const row of groups.data ?? []) {
    const names = byCode.get(row.code) ?? [];
    names.push(row.name);
    byCode.set(row.code, names);
  }
  const sharedCodes = [...byCode.entries()].filter(([, names]) => names.length > 1).map(([code, names]) => ({ code, names }));

  const sources = [
    { table: "product_groups", column: "name" },
    { table: "stitching_processes", column: "name" },
    { table: "stitching_measurement_fields", column: "label" },
  ] as const;
  const spellingHits: { table: string; changed: number }[] = [];
  for (const source of sources) {
    spellingHits.push({ table: source.table, changed: await renameRows(supabase, source.table, source.column) });
  }
  const saved = await supabase.from("stitching_order_measurements").select("label");
  if (saved.error) throw new Error(saved.error.message);
  const keptOnOrders = (saved.data ?? []).filter((row) => correctedSpelling(row.label) !== row.label).length;

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", sharedCodes, spellingHits, keptOnOrders }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Proposal failed.");
  process.exit(1);
});
