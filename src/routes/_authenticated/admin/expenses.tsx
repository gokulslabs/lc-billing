import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { expenseColumns, expenseLedgerTotals, type ExpenseRecord } from "@/lib/expenses";
import { expenseExportSheets } from "@/lib/expenses-export";
import { shopToday } from "@/lib/sales";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/expenses")({
  head: () => ({ meta: [{ title: "Expenses — Ladies Collections" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const [viewDate, setViewDate] = useState(shopToday());
  const [viewMode, setViewMode] = useState<"day" | "month">("day");
  const [exportFrom, setExportFrom] = useState(shopToday());
  const [exportTo, setExportTo] = useState(shopToday());
  const month = viewDate.slice(0, 7);
  const query = useQuery({ queryKey: ["expenses", month, viewMode, viewDate], queryFn: () => apiFetch<{ records: ExpenseRecord[] }>(viewMode === "day" ? `/api/expenses?from=${viewDate}&to=${viewDate}` : `/api/expenses?month=${month}`) });
  const records = query.data?.records ?? [];
  const rows = (sheet: "ledger" | "target") => records.filter((r) => r.sheet === sheet && (viewMode === "month" || r.entryDate === viewDate));
  function showDay(date: string) { if (!date) return; setViewDate(date); setViewMode("day"); setExportFrom(date); setExportTo(date); }
  function showMonth() { setViewMode("month"); setExportFrom(`${month}-01`); setExportTo(lastDay(month)); }
  return (
    <main className="mx-auto max-w-[110rem] space-y-6 p-4 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold md:text-4xl">Expenses</h1><p className="mt-2 text-sm text-muted-foreground">{viewMode === "day" ? `Entries for ${viewDate}` : `All entries for ${month}`}</p></div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="outline" onClick={() => showDay(shiftDay(viewDate, -1))}>Previous day</Button>
          <label className="text-sm">View date<Input type="date" value={viewDate} onChange={(e) => showDay(e.target.value)} className="mt-1" /></label>
          <Button variant="outline" onClick={() => showDay(shiftDay(viewDate, 1))}>Next day</Button>
          <Button variant={viewMode === "day" && viewDate === shopToday() ? "default" : "outline"} onClick={() => showDay(shopToday())}>Today</Button>
          <Button variant={viewMode === "month" ? "default" : "outline"} onClick={showMonth}>All month</Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Export from<Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="mt-1" /></label>
          <label className="text-sm">Export to<Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="mt-1" /></label>
          <ExportExcelButton filename={`expenses-${exportFrom}-to-${exportTo}`} load={async () => {
            if (!exportFrom || !exportTo || exportFrom > exportTo) throw new Error("Choose a valid export date range.");
            const { records: selected } = await apiFetch<{ records: ExpenseRecord[] }>(`/api/expenses?from=${encodeURIComponent(exportFrom)}&to=${encodeURIComponent(exportTo)}`);
            return expenseExportSheets(selected, exportFrom, exportTo);
          }} />
        </div>
      </div>
      {query.isLoading ? <p>Loading expenses…</p> : null}
      {query.error instanceof Error ? <p className="text-destructive">{query.error.message}</p> : null}
      <Tabs defaultValue="ledger"><TabsList><TabsTrigger value="ledger">Expenses and income</TabsTrigger><TabsTrigger value="target">Target wise payment</TabsTrigger></TabsList>
        <TabsContent value="ledger" className="mt-5"><ExpenseTable key={`ledger-${viewDate}-${viewMode}`} sheet="ledger" month={month} entryDate={viewDate} emptyLabel={viewMode === "day" ? "No rows for this day." : "No rows for this month."} records={rows("ledger")} /></TabsContent>
        <TabsContent value="target" className="mt-5"><ExpenseTable key={`target-${viewDate}-${viewMode}`} sheet="target" month={month} entryDate={viewDate} emptyLabel={viewMode === "day" ? "No rows for this day." : "No rows for this month."} records={rows("target")} /></TabsContent>
      </Tabs>
    </main>
  );
}

function lastDay(month: string): string { const [year, number] = month.split("-").map(Number); return new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10); }
function shiftDay(date: string, days: number): string { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }

const amountFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function ExpenseTable({ sheet, month, entryDate, emptyLabel, records }: { sheet: "ledger" | "target"; month: string; entryDate: string; emptyLabel: string; records: ExpenseRecord[] }) {
  const client = useQueryClient();
  const columns = expenseColumns(sheet);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState(entryDate);
  const inputColumns = sheet === "target" ? columns.slice(2) : columns;
  const [cells, setCells] = useState<string[]>(Array(inputColumns.length).fill(""));
  const totals = sheet === "ledger" ? expenseLedgerTotals(records) : null;
  const save = useMutation({ mutationFn: () => apiFetch(`/api/expenses${editing ? `/${editing}` : ""}`, { method: editing ? "PATCH" : "POST", body: JSON.stringify({ sheet, entryDate: date, details: cells }) }), onSuccess: async () => { setEditing(null); setCells(Array(inputColumns.length).fill("")); toast.success("Row saved."); await client.invalidateQueries({ queryKey: ["expenses", month] }); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (id: string) => apiFetch(`/api/expenses/${id}`, { method: "DELETE" }), onSuccess: async () => { toast.success("Row removed."); await client.invalidateQueries({ queryKey: ["expenses", month] }); }, onError: (e: Error) => toast.error(e.message) });
  function submit(e: FormEvent) { e.preventDefault(); if (!cells.some((v) => v.trim())) { toast.error("Enter at least one value."); return; } save.mutate(); }
  function edit(r: ExpenseRecord) { setEditing(r.id); setDate(r.entryDate); setCells([...r.details, ...Array(inputColumns.length).fill("")].slice(0, inputColumns.length)); }
  return <section className="space-y-4">
    <form onSubmit={submit} className="rounded-2xl border bg-card p-4"><div className="mb-3 flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{editing ? "Edit row" : "Add row"}</h2><label className="text-sm">Date<Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" /></label></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{inputColumns.map((label, i) => <label key={`${label}-${i}`} className="text-sm">{label}<Input className="mt-1" value={cells[i] ?? ""} onChange={(e) => setCells((prev) => prev.map((v, n) => n === i ? e.target.value : v))} /></label>)}</div>
      <div className="mt-4 flex gap-2"><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save changes" : "Add row"}</Button>{editing ? <Button type="button" variant="outline" onClick={() => { setEditing(null); setCells(Array(inputColumns.length).fill("")); }}>Cancel</Button> : null}</div>
    </form>
    <div className="overflow-x-auto rounded-2xl border bg-card">
      <table className="w-full min-w-max text-sm">
        <thead className="bg-muted/50"><tr>{sheet === "ledger" ? <th className="p-3 text-left">Date</th> : null}{columns.map((c, i) => <th key={`${c}-${i}`} className="p-3 text-left font-semibold">{c}</th>)}<th className="p-3 text-left">Actions</th></tr></thead>
        <tbody>{records.map((r, index) => <tr key={r.id} className="border-t">{sheet === "ledger" ? <td className="p-3">{r.entryDate}</td> : null}{(sheet === "target" ? [String(index + 1), r.entryDate, ...r.details] : r.details).map((v, i) => <td key={i} className="p-3">{v || "—"}</td>)}<td className="whitespace-nowrap p-3"><Button size="sm" variant="outline" onClick={() => edit(r)}>Edit</Button> <Button size="sm" variant="outline" onClick={() => remove.mutate(r.id)} disabled={remove.isPending}>Remove</Button></td></tr>)}</tbody>
        {totals ? <tfoot className="border-t-2 border-foreground/20 bg-muted/40 font-semibold">
          <LedgerFooterRow cells={["TOT EXPENSES", totals.gpayCheque, totals.cashExpenses, "", "", "CASH RECIPETS", totals.cashReceipts, "", totals.savingsAccount, totals.currentAccount, totals.billPending, ""]} />
          <LedgerFooterRow cells={["SHREEDEVI MAM", "", "", "", "", "CASH EXPENSES", totals.cashExpenses, "", "", "", "", ""]} />
          <LedgerFooterRow cells={["", "", "", "", "", "HAND CASH", totals.handCash, "", "", "", "", ""]} highlight />
        </tfoot> : null}
      </table>
      {!records.length ? <p className="border-t p-6 text-sm text-muted-foreground">{emptyLabel}</p> : null}
    </div>
  </section>;
}

function LedgerFooterRow({ cells, highlight = false }: { cells: (string | number)[]; highlight?: boolean }) {
  return <tr className={highlight ? "border-t bg-primary/10" : "border-t"}>
    <td className="p-3" />
    {cells.map((value, index) => <td key={index} className="whitespace-nowrap p-3 tabular-nums">{typeof value === "number" ? amountFormat.format(value) : value}</td>)}
    <td className="p-3" />
  </tr>;
}
