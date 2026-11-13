import { Hono } from "hono";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireShop } from "@/server/guard";
import { readAll } from "@/server/read-all";
import type { Json } from "@/integrations/supabase/types";

type Env = { Variables: { userId: string } };
type Row = { id: string; sheet: string; entry_date: string; details: Json };
const input = z.object({ sheet: z.enum(["ledger", "target"]), entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), details: z.array(z.string().max(300)).max(12) });
const expenses = new Hono<Env>();
expenses.use("*", requireShop);
expenses.get("/", async (c) => {
  const month = c.req.query("month") ?? "";
  const fromDate = c.req.query("from") ?? "";
  const toDate = c.req.query("to") ?? "";
  const range = fromDate || toDate;
  if (range ? !validDate(fromDate) || !validDate(toDate) || fromDate > toDate : !/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "Choose a valid month or date range." }, 400);
  const loaded = await readAll<Row>((from, to) => {
    let request = supabaseAdmin.from("expense_records").select("id,sheet,entry_date,details").gte("entry_date", range ? fromDate : `${month}-01`);
    request = range ? request.lte("entry_date", toDate) : request.lt("entry_date", nextMonth(month));
    return request.order("entry_date").order("sort_order").range(from, to);
  });
  if (!loaded) return c.json({ error: "Could not load expenses." }, 500);
  return c.json({ records: loaded.rows.map(record) });
});
expenses.post("/", async (c) => {
  const parsed = input.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a valid date and row." }, 400);
  const x = parsed.data;
  const { data, error } = await supabaseAdmin.from("expense_records").insert({ sheet: x.sheet, entry_date: x.entryDate, details: { cells: x.details } }).select("id,sheet,entry_date,details").single();
  if (error || !data) return c.json({ error: "Could not save the row. Apply the expense_records migration first." }, 500);
  return c.json({ record: record(data as Row) }, 201);
});
expenses.patch("/:id", async (c) => {
  const parsed = input.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Enter a valid date and row." }, 400);
  const x = parsed.data;
  const { data, error } = await supabaseAdmin.from("expense_records").update({ sheet: x.sheet, entry_date: x.entryDate, details: { cells: x.details } }).eq("id", c.req.param("id")).select("id,sheet,entry_date,details").single();
  if (error || !data) return c.json({ error: "Could not update the row." }, 500);
  return c.json({ record: record(data as Row) });
});
expenses.delete("/:id", async (c) => {
  const { error } = await supabaseAdmin.from("expense_records").delete().eq("id", c.req.param("id"));
  if (error) return c.json({ error: "Could not remove the row." }, 500);
  return c.json({ ok: true });
});
function record(x: Row) { const detail = x.details && typeof x.details === "object" && !Array.isArray(x.details) ? x.details : {}; return { id: x.id, sheet: x.sheet, entryDate: x.entry_date, details: Array.isArray(detail["cells"]) ? detail["cells"] : [] }; }
function nextMonth(value: string) { const [y, m] = value.split("-").map(Number); return new Date(Date.UTC(y ?? 2000, m ?? 1, 1)).toISOString().slice(0, 10); }
function validDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value; }
export { expenses as expenseRoutes };
