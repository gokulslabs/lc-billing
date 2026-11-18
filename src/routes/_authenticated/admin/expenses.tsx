import { Fragment, useRef, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  expenseColumns,
  expenseLedgerTotals,
  expenseOpeningBalanceBefore,
  expenseOpeningBalanceRows,
  type ExpenseRecord,
} from "@/lib/expenses";
import { expenseExportSheets } from "@/lib/expenses-export";
import { downloadExcel, shareExcelFile } from "@/lib/excel";
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
  const [sharing, setSharing] = useState(false);
  const month = viewDate.slice(0, 7);
  const query = useQuery({
    queryKey: ["expenses", month],
    queryFn: () =>
      apiFetch<{ records: ExpenseRecord[]; previousClosingBalance: number | null }>(
        `/api/expenses?month=${month}`,
      ),
  });
  const records = query.data?.records ?? [];
  const rows = (sheet: "ledger" | "target") =>
    records.filter((r) => r.sheet === sheet && (viewMode === "month" || r.entryDate === viewDate));
  function showDay(date: string) {
    if (!date) return;
    setViewDate(date);
    setViewMode("day");
    setExportFrom(date);
    setExportTo(date);
  }
  function showMonth() {
    setViewMode("month");
    setExportFrom(`${month}-01`);
    setExportTo(lastDay(month));
  }
  return (
    <main className="mx-auto w-full min-w-0 max-w-[110rem] space-y-6 p-4 md:p-10">
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold md:text-4xl">Expenses</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {viewMode === "day" ? `Entries for ${viewDate}` : `All entries for ${month}`}
        </p>
      </div>
      <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto rounded-2xl border border-border bg-card p-3 sm:p-4 [&>*]:shrink-0">
        <Button variant="outline" onClick={() => showDay(shiftDay(viewDate, -1))}>
          Previous day
        </Button>
        <label className="w-40 text-sm">
          View date
          <Input
            type="date"
            value={viewDate}
            onChange={(e) => showDay(e.target.value)}
            className="mt-1 w-full"
          />
        </label>
        <Button variant="outline" onClick={() => showDay(shiftDay(viewDate, 1))}>
          Next day
        </Button>
        <Button
          variant={viewMode === "day" && viewDate === shopToday() ? "default" : "outline"}
          onClick={() => showDay(shopToday())}
        >
          Today
        </Button>
        <Button variant={viewMode === "month" ? "default" : "outline"} onClick={showMonth}>
          All month
        </Button>
        <label className="w-40 text-sm">
          Export from
          <Input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="mt-1 w-full"
          />
        </label>
        <label className="w-40 text-sm">
          Export to
          <Input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="mt-1 w-full"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={sharing}
          onClick={() => {
            const period = viewMode === "day" ? slashDate(viewDate) : month;
            const selected = records.filter(
              (record) =>
                (record.sheet === "ledger" || record.sheet === "target") &&
                (viewMode === "month" || record.entryDate === viewDate) &&
                record.details.some((cell) => cell.trim() !== ""),
            );
            if (selected.length === 0) {
              toast.error(
                viewMode === "day"
                  ? "No expense records for this day to share."
                  : "No expense records for this month to share.",
              );
              return;
            }
            const from = viewMode === "day" ? viewDate : `${month}-01`;
            const to = viewMode === "day" ? viewDate : lastDay(month);
            const filename = `expenses-${from}-to-${to}`;
            const startingBalance = expenseOpeningBalanceBefore(
              records,
              from,
              query.data?.previousClosingBalance ?? null,
            );
            const sheets = expenseExportSheets(selected, from, to, startingBalance);
            const shareText = `Expenses workbook for ${period}`;
            const share = shareExcelFile(
              filename,
              sheets,
              `Ladies Collections expenses ${period}`,
              shareText,
            );
            if (!share) {
              downloadExcel(filename, sheets);
              window.open(
                `https://wa.me/?text=${encodeURIComponent(`${shareText}. The Excel file has been downloaded; attach it to this WhatsApp message.`)}`,
                "_blank",
                "noopener,noreferrer",
              );
              toast.info("Excel workbook downloaded. Attach it in WhatsApp.");
              return;
            }
            setSharing(true);
            void share
              .catch((error: unknown) => {
                if (error instanceof DOMException && error.name === "AbortError") return;
                downloadExcel(filename, sheets);
                toast.info("Excel workbook downloaded. Attach it in WhatsApp.");
              })
              .finally(() => setSharing(false));
          }}
        >
          {sharing
            ? "Preparing Excel…"
            : viewMode === "day"
              ? "Send daily Excel to owner"
              : "WhatsApp Excel"}
        </Button>
        <ExportExcelButton
          filename={`expenses-${exportFrom}-to-${exportTo}`}
          load={async () => {
            if (!exportFrom || !exportTo || exportFrom > exportTo)
              throw new Error("Choose a valid export date range.");
            const { records: selected, previousClosingBalance } = await apiFetch<{
              records: ExpenseRecord[];
              previousClosingBalance: number | null;
            }>(
              `/api/expenses?from=${encodeURIComponent(exportFrom)}&to=${encodeURIComponent(exportTo)}`,
            );
            return expenseExportSheets(selected, exportFrom, exportTo, previousClosingBalance);
          }}
        />
      </div>
      {query.isLoading ? <p>Loading expenses…</p> : null}
      {query.error instanceof Error ? (
        <p className="text-destructive">{query.error.message}</p>
      ) : null}
      <Tabs defaultValue="ledger">
        <TabsList className="h-auto max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="ledger">Expenses and income</TabsTrigger>
          <TabsTrigger value="target">Target wise payment</TabsTrigger>
        </TabsList>
        <TabsContent value="ledger" className="mt-5">
          <ExpenseTable
            key={`ledger-${viewDate}-${viewMode}`}
            sheet="ledger"
            month={month}
            viewMode={viewMode}
            entryDate={viewDate}
            emptyLabel={viewMode === "day" ? "No rows for this day." : "No rows for this month."}
            records={records.filter((record) => record.sheet === "ledger")}
            startingBalance={query.data?.previousClosingBalance ?? null}
          />
        </TabsContent>
        <TabsContent value="target" className="mt-5">
          <ExpenseTable
            key={`target-${viewDate}-${viewMode}`}
            sheet="target"
            month={month}
            viewMode={viewMode}
            entryDate={viewDate}
            emptyLabel={viewMode === "day" ? "No rows for this day." : "No rows for this month."}
            records={rows("target")}
            startingBalance={null}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function slashDate(date: string): string {
  const [year, month, day] = date.split("-");
  return day && month && year ? `${day}-${month}-${year}` : date;
}
function lastDay(month: string): string {
  const [year = "1970", number = "1"] = month.split("-");
  return new Date(Date.UTC(Number(year), Number(number), 0)).toISOString().slice(0, 10);
}
function shiftDay(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const amountFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
const currencyFormat = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function ExpenseTable({
  sheet,
  month,
  viewMode,
  entryDate,
  emptyLabel,
  records,
  startingBalance,
}: {
  sheet: "ledger" | "target";
  month: string;
  viewMode: "day" | "month";
  entryDate: string;
  emptyLabel: string;
  records: ExpenseRecord[];
  startingBalance: number | null;
}) {
  const client = useQueryClient();
  const columns = expenseColumns(sheet);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState(entryDate);
  const dateInput = useRef<HTMLInputElement>(null);
  const inputColumns = sheet === "target" ? columns.slice(2) : columns;
  const [cells, setCells] = useState<string[]>(Array(inputColumns.length).fill(""));
  const openingRows = sheet === "ledger" ? expenseOpeningBalanceRows(records, startingBalance) : [];
  if (
    sheet === "ledger" &&
    viewMode === "day" &&
    !records.some((record) => record.entryDate === entryDate) &&
    expenseOpeningBalanceBefore(records, entryDate, startingBalance) !== null
  ) {
    const cells = Array(columns.length).fill("") as string[];
    cells[3] = "OPENING BALANCES";
    cells[6] = String(expenseOpeningBalanceBefore(records, entryDate, startingBalance));
    openingRows.push({
      id: `opening-${entryDate}`,
      sheet: "ledger",
      entryDate,
      details: cells,
    });
  }
  const displayRecords = [...records, ...openingRows]
    .filter((record) => viewMode === "month" || record.entryDate === entryDate)
    .sort((a, b) => {
      const dayOrder = a.entryDate.localeCompare(b.entryDate);
      if (dayOrder) return dayOrder;
      return Number(b.id.startsWith("opening-")) - Number(a.id.startsWith("opening-"));
    });
  const dailyGroups = new Map<string, ExpenseRecord[]>();
  if (sheet === "ledger") {
    for (const record of displayRecords) {
      const group = dailyGroups.get(record.entryDate) ?? [];
      group.push(record);
      dailyGroups.set(record.entryDate, group);
    }
  }
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/expenses${editing ? `/${editing}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ sheet, entryDate: date, details: savedExpenseCells(sheet, cells) }),
      }),
    onSuccess: async () => {
      setEditing(null);
      setCells(Array(inputColumns.length).fill(""));
      toast.success("Row saved.");
      await client.invalidateQueries({ queryKey: ["expenses", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/expenses/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Row removed.");
      await client.invalidateQueries({ queryKey: ["expenses", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveOpening = useMutation({
    mutationFn: (row: ExpenseRecord) =>
      apiFetch("/api/expenses", {
        method: "POST",
        body: JSON.stringify({ sheet: "ledger", entryDate: row.entryDate, details: row.details }),
      }),
    onSuccess: async () => {
      toast.success("Opening balance saved.");
      await client.invalidateQueries({ queryKey: ["expenses", month] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!cells.some((v) => v.trim())) {
      toast.error("Enter at least one value.");
      return;
    }
    save.mutate();
  }
  function edit(r: ExpenseRecord) {
    setEditing(r.id);
    setDate(r.entryDate);
    setCells(
      inputColumns.map((_, index) =>
        sheet === "target" && index === 4
          ? targetPercentageForInput(r.details[index] ?? "")
          : (r.details[index] ?? ""),
      ),
    );
    dateInput.current?.focus();
  }
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold" id={`${sheet}-entry-heading`}>
        {editing ? "Edit row" : "Add row"}
      </h2>
      <form
        onSubmit={submit}
        aria-labelledby={`${sheet}-entry-heading`}
        className="min-w-0 overflow-x-auto rounded-2xl border bg-card"
      >
        {sheet === "ledger" ? (
          <label className="block w-48 p-3 text-sm">
            Entry date
            <Input
              ref={dateInput}
              aria-label="Entry date"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="mt-1 w-full"
            />
          </label>
        ) : null}
        <table className="w-full min-w-max text-sm">
          <thead className="bg-muted/50">
            <tr>
              <ExpenseColumnHeaders sheet={sheet} columns={columns} />
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t bg-muted/20">
              {sheet === "target" ? <td className="p-2" /> : null}
              {sheet === "target" ? (
                <td className="p-2">
                  <Input
                    ref={dateInput}
                    aria-label="Entry date"
                    type="date"
                    required
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    className="min-w-36"
                  />
                </td>
              ) : null}
              {inputColumns.map((label, index) => (
                <td key={`${label}-${index}`} className="p-2">
                  <Input
                    aria-label={
                      sheet === "ledger" && label === "CASH"
                        ? index === 2
                          ? "Cash expenses"
                          : "Cash receipts"
                        : label
                    }
                    className="min-w-24"
                    placeholder={sheet === "target" && index === 4 ? "e.g. 1" : undefined}
                    value={cells[index] ?? ""}
                    onChange={(e) =>
                      setCells((previous) =>
                        previous.map((value, cell) => (cell === index ? e.target.value : value)),
                      )
                    }
                  />
                </td>
              ))}
              <td className="whitespace-nowrap p-2">
                <div className="flex gap-2">
                  <Button type="submit" disabled={save.isPending}>
                    {save.isPending ? "Saving…" : editing ? "Save changes" : "Add row"}
                  </Button>
                  {editing ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditing(null);
                        setCells(Array(inputColumns.length).fill(""));
                      }}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
            {sheet === "ledger"
              ? [...dailyGroups.entries()].map(([day, dayRecords]) => (
                  <Fragment key={day}>
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td colSpan={3} className="border-x border-border" />
                      <td className="border-x border-border p-3 text-center">{excelDate(day)}</td>
                      <td colSpan={8} className="border-x border-border" />
                      <td className="border-x border-border" />
                    </tr>
                    <tr className="bg-muted/50">
                      <ExpenseColumnHeaders sheet="ledger" columns={columns} />
                      <th className="p-3 text-left">Actions</th>
                    </tr>
                    {dayRecords.map((r) => {
                      const generated = r.id.startsWith("opening-");
                      return (
                        <tr key={r.id} className={generated ? "border-t bg-muted/20" : "border-t"}>
                          {r.details.map((value, index) => (
                            <td key={index} className="border-x border-border p-3 text-center">
                              <span className={expenseCellColor(index, value)}>{value || "—"}</span>
                            </td>
                          ))}
                          <td className="whitespace-nowrap p-3">
                            {generated ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => saveOpening.mutate(r)}
                                disabled={saveOpening.isPending}
                              >
                                Save opening balance
                              </Button>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => edit(r)}
                                >
                                  Edit
                                </Button>{" "}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => remove.mutate(r.id)}
                                  disabled={remove.isPending}
                                >
                                  Remove
                                </Button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <LedgerFooterRows totals={expenseLedgerTotals(dayRecords)} />
                  </Fragment>
                ))
              : records.map((r, index) => (
                  <tr key={r.id} className="border-t">
                    <td className="border-x border-border p-3 text-center">{String(index + 1)}</td>
                    <td className="border-x border-border p-3 text-center">{r.entryDate}</td>
                    {r.details.map((value, i) => (
                      <td key={i} className="border-x border-border p-3 text-center">
                        {formatExpenseValue(sheet, i, value) || "—"}
                      </td>
                    ))}
                    <td className="whitespace-nowrap p-3">
                      <Button type="button" size="sm" variant="outline" onClick={() => edit(r)}>
                        Edit
                      </Button>{" "}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => remove.mutate(r.id)}
                        disabled={remove.isPending}
                      >
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        {!displayRecords.length ? (
          <p className="border-t p-6 text-sm text-muted-foreground">{emptyLabel}</p>
        ) : null}
      </form>
    </section>
  );
}

function LedgerFooterRow({ cells }: { cells: (string | number)[] }) {
  return (
    <tr className="border-t bg-[#FFC000] font-medium text-black">
      {cells.map((value, index) => (
        <td
          key={index}
          className="whitespace-nowrap border-x border-border p-3 text-center tabular-nums"
        >
          {typeof value === "number" ? amountFormat.format(value) : value}
        </td>
      ))}
      <td className="p-3" />
    </tr>
  );
}

function LedgerFooterRows({ totals }: { totals: ReturnType<typeof expenseLedgerTotals> }) {
  return (
    <>
      <LedgerFooterRow
        cells={[
          "TOT EXPENSES",
          totals.gpayCheque,
          totals.cashExpenses,
          "",
          "",
          "CASH RECIPETS",
          totals.cashReceipts,
          "",
          totals.savingsAccount,
          totals.currentAccount,
          totals.billPending,
          "",
        ]}
      />
      <LedgerFooterRow
        cells={[
          "SHREEDEVI MAM",
          "",
          "",
          "",
          "",
          "CASH EXPENSES",
          totals.cashExpenses,
          "",
          "",
          "",
          "",
          "",
        ]}
      />
      <LedgerFooterRow
        cells={["", "", "", "", "", "HAND CASH", totals.handCash, "", "", "", "", ""]}
      />
    </>
  );
}

function ExpenseColumnHeaders({
  sheet,
  columns,
}: {
  sheet: "ledger" | "target";
  columns: readonly string[];
}) {
  return (
    <>
      {columns.map((column, index) => {
        const color =
          sheet === "ledger"
            ? index < 2 || index === columns.length - 1
              ? "text-[#FF0000]"
              : index === 2
                ? "text-foreground"
                : "text-[#00B050]"
            : "text-foreground";
        return (
          <th
            key={`${column}-${index}`}
            className={`border border-border p-3 text-center font-semibold ${color}`}
          >
            {column}
          </th>
        );
      })}
    </>
  );
}

function expenseCellColor(index: number, value: string): string {
  const text = value.trim().toUpperCase();
  if (index === 10 && ["NILL", "BILL PENDING"].includes(text)) return "text-[#00B050]";
  if (index !== 11) return "";
  if (["PAID", "CLEARED", "ADVANCE", "ADVANCE (2)"].includes(text)) return "text-[#00B050]";
  if (text.includes("NOT PAID") || text.includes("NOT CLEARED")) return "text-[#FF0000]";
  return "";
}

function excelDate(date: string): string {
  const [year = "", month = "", day = ""] = date.split("-");
  return `${month}-${day}-${year.slice(-2)}`;
}

function targetPercentageForInput(value: string): string {
  const parsed = Number(value.replace("%", "").trim());
  return value.trim() && Number.isFinite(parsed) ? String(parsed * 100) : value;
}

function savedExpenseCells(sheet: "ledger" | "target", cells: string[]): string[] {
  if (sheet !== "target") return cells;
  return cells.map((value, index) => {
    if (index !== 4 || !value.trim()) return value;
    const parsed = Number(value.replace("%", "").trim());
    return Number.isFinite(parsed) ? String(parsed / 100) : value;
  });
}

function formatExpenseValue(sheet: "ledger" | "target", index: number, value: string): string {
  if (sheet !== "target") return value;
  if (index === 4) {
    const parsed = Number(value.replace("%", "").trim());
    return Number.isFinite(parsed)
      ? `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(parsed * 100)}%`
      : value;
  }
  if (index === 3 || index === 5) {
    const parsed = Number(value.replace(/[₹,\s]/g, ""));
    return Number.isFinite(parsed) ? currencyFormat.format(parsed) : value;
  }
  return value;
}
