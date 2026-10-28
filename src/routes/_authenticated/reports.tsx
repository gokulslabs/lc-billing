import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { ListFooter } from "@/components/app/ListFooter";
import { monthStart } from "@/lib/reports";
import { billStatusLabel, shopToday } from "@/lib/sales";
import { formatRupees } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Ladies Collections" },
      { name: "description", content: "Invoice, collection, pending, mismatch, and return reports for Ladies Collections." },
    ],
  }),
  component: ReportsPage,
});

const REPORTS = [
  { id: "invoices", label: "Invoice list (date)" },
  { id: "items", label: "Invoice list (items)" },
  { id: "extract", label: "Invoice list (extract)" },
  { id: "collections", label: "Collection list (date)" },
  { id: "showrooms", label: "Collection list (showroom)" },
  { id: "pending", label: "Payment pending" },
  { id: "mismatch", label: "Inventory mismatch" },
  { id: "returns", label: "Invoice list (return)" },
] as const;

type ReportId = (typeof REPORTS)[number]["id"];

const REPORT_NOTES: Record<ReportId, string> = {
  invoices: "One row per bill in the dates, excluding drafts and cancelled bills. Gross, discount and net are on the bill.",
  items: "One row per line on those bills. This is the same list as Extract, without the customer.",
  extract: "The same lines as Items, with the customer name added.",
  collections: "Payments taken on the chosen date, one row per payment.",
  showrooms: "Each payment in the dates, with its date, bill, customer and method. Showroom is the note on that payment.",
  pending: "Bills in the chosen book that still have a balance. The total is the whole book, not only this page.",
  mismatch: "Inventory numbers whose shelf quantity does not equal what was received minus what was billed. Matching numbers stay on the stock list.",
  returns: "Cancelled bills in the dates, one row per bill.",
};

function ReportsPage() {
  const today = shopToday();
  const [report, setReport] = useState<ReportId>("invoices");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [date, setDate] = useState(today);
  const [books, setBooks] = useState<"new" | "old">("new");
  const [page, setPage] = useState(1);
  const [applied, setApplied] = useState({ from: monthStart(today), to: today, date: today, books: "new" as "new" | "old" });
  const needsRange = report !== "collections" && report !== "pending" && report !== "mismatch";
  const needsDate = report === "collections";

  const result = useQuery({
    queryKey: ["reports", report, applied, page],
    queryFn: () => loadReport(report, applied, page),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div>
        <h1 className="text-4xl font-semibold">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">Bills, collections, pending payments, and stock.</p>
      </div>
      <Select
        value={report}
        onValueChange={(value) => {
          setReport(value as ReportId);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {REPORTS.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-sm text-muted-foreground">{REPORT_NOTES[report]}</p>
      {needsRange || needsDate ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({ from, to, date, books });
          }}
        >
          {needsDate ? (
            <div className="space-y-2">
              <Label htmlFor="report-date">Date</Label>
              <Input id="report-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="report-from">From date</Label>
                <Input id="report-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-to">To date</Label>
                <Input id="report-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
              </div>
            </>
          )}
          <Button type="submit" className="rounded-full">
            Get
          </Button>
        </form>
      ) : null}
      {report === "pending" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={books}
            onValueChange={(value) => {
              const next = value === "old" ? "old" : "new";
              setBooks(next);
              setPage(1);
              setApplied((current) => ({ ...current, books: next }));
            }}
          >
            <SelectTrigger className="w-64" aria-label="Which books">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
            <SelectItem value="new">Live book</SelectItem>
            <SelectItem value="old">Old book — copied balances</SelectItem>
          </SelectContent>
        </Select>
      </div>
      ) : null}
      {result.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {result.error instanceof Error ? <p className="text-sm text-destructive">{result.error.message}</p> : null}
      {result.data?.note ? <p className="text-sm text-muted-foreground">{result.data.note}</p> : null}
      {result.data ? <ReportTable sheet={result.data} /> : null}
      {report === "pending" && result.data ? (
        <ListFooter page={page} total={result.data.total ?? 0} shown={result.data.rows.length} onPage={setPage} />
      ) : null}
    </div>
  );
}

type Sheet = { columns: string[]; rows: string[][]; note?: string; totalRow?: string[]; total?: number };

function ReportTable({ sheet }: { sheet: Sheet }) {
  return (
    <div className="space-y-3">
      {sheet.rows.length > 0 || sheet.totalRow ? (
        <Button type="button" variant="outline" className="rounded-full" onClick={() => downloadSheet(sheet)}>
          Spreadsheet
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing in this report.</p>
      )}
      {sheet.rows.length > 0 || sheet.totalRow ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {sheet.columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheet.rows.map((row, index) => (
                <TableRow key={index}>
                  {row.map((cell, cellIndex) => (
                    <TableCell key={cellIndex} className={cellIndex === 0 ? "font-medium" : undefined}>
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            {sheet.totalRow ? (
              <TableFooter>
                <TableRow>
                  {sheet.totalRow.map((cell, cellIndex) => (
                    <TableCell key={cellIndex}>{cell}</TableCell>
                  ))}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function bookNote(books: "new" | "old"): string {
  return books === "old"
    ? "Old book — copied balances. Every bill dated before 26 Oct 2026 that still has a balance is here. The total is every bill in this book, not only this page. The live book is the other choice. Do not add the two lists together."
    : "Live book. Every bill from 26 Oct 2026 that still has a balance is here. The total is every bill in this book, not only this page. Old book — copied balances is the other choice. Do not add the two lists together.";
}

async function loadReport(report: ReportId, range: { from: string; to: string; date: string; books: "new" | "old" }, page: number): Promise<Sheet> {
  const dates = `from=${range.from}&to=${range.to}`;
  if (report === "invoices") {
    const data = await apiFetch<{ invoices: { billNo: string; billedOn: string; customerName: string; gross: number; discount: number; net: number }[] }>(
      `/api/reports/invoices?${dates}`,
    );
    const gross = sumRupees(data.invoices.map((row) => row.gross));
    const discount = sumRupees(data.invoices.map((row) => row.discount));
    const net = sumRupees(data.invoices.map((row) => row.net));
    return {
      columns: ["Sl.no.", "Invoice no.", "Date", "Customer", "Gross", "Disc.", "Net"],
      rows: data.invoices.map((row, index) => [
        String(index + 1),
        row.billNo,
        row.billedOn,
        row.customerName,
        formatRupees(row.gross),
        formatRupees(row.discount),
        formatRupees(row.net),
      ]),
      totalRow: ["Total", "", "", "", formatRupees(gross), formatRupees(discount), formatRupees(net)],
    };
  }
  if (report === "items" || report === "extract") {
    const path = report === "items" ? "items" : "extract";
    const key = report === "items" ? "items" : "rows";
    const data = await apiFetch<Record<string, { billNo: string; billedOn: string; customerName: string | null; inventoryNo: string; productCode: string; productName: string; quantity: number; rate: number; amount: number }[]>>(
      `/api/reports/${path}?${dates}`,
    );
    const rows = data[key] ?? [];
    const withCustomer = report === "extract";
    const quantity = sumQty(rows.map((row) => row.quantity));
    const amount = sumRupees(rows.map((row) => row.amount));
    return {
      columns: [
        "Sl.no.",
        "Showroom",
        "Bill no.",
        "Date",
        ...(withCustomer ? ["Customer"] : []),
        "Inventory no.",
        "Code",
        "Product",
        "HSN",
        "Qty",
        "Rate",
        "Amount",
      ],
      rows: rows.map((row, index) => [
        String(index + 1),
        "—",
        row.billNo,
        row.billedOn,
        ...(withCustomer ? [row.customerName || "—"] : []),
        row.inventoryNo,
        row.productCode,
        row.productName,
        "—",
        String(row.quantity),
        formatRupees(row.rate),
        formatRupees(row.amount),
      ]),
      totalRow: ["Total", "", "", "", ...(withCustomer ? [""] : []), "", "", "", "", String(quantity), "", formatRupees(amount)],
    };
  }
  if (report === "collections") {
    const data = await apiFetch<{
      collections: { showroom: string | null; billNo: string; paidOn: string; remarks: string | null; mode: string | null; amount: number }[];
    }>(`/api/reports/collections?date=${range.date}`);
    return {
      columns: ["Sl.no.", "Showroom", "Bill no.", "Date", "Payment mode", "Remarks", "Amount"],
      rows: data.collections.map((row, index) => [
        String(index + 1),
        row.showroom || "—",
        row.billNo,
        row.paidOn,
        row.mode === "CASH" ? "Cash" : row.mode === "UPI" ? "UPI" : row.mode === "CARD" ? "Card" : "Not recorded",
        row.remarks || "—",
        formatRupees(row.amount),
      ]),
      totalRow: ["Total", "", "", "", "", "", formatRupees(sumRupees(data.collections.map((row) => row.amount)))],
    };
  }
  if (report === "showrooms") {
    const data = await apiFetch<{
      payments: { paidOn: string; billNo: string; customerName: string; mode: string | null; showroom: string | null; amount: number }[];
    }>(`/api/reports/showrooms?${dates}`);
    return {
      columns: ["Date", "Bill no.", "Customer", "Method", "Showroom", "Amount"],
      rows: data.payments.map((row) => [
        row.paidOn,
        row.billNo || "—",
        row.customerName || "—",
        row.mode === "CASH" ? "Cash" : row.mode === "UPI" ? "UPI" : row.mode === "CARD" ? "Card" : "Not recorded",
        row.showroom || "—",
        formatRupees(row.amount),
      ]),
      totalRow: ["Total", "", "", "", "", formatRupees(sumRupees(data.payments.map((row) => row.amount)))],
    };
  }
  if (report === "pending") {
    const data = await apiFetch<{
      pending: { customerName: string; billNo: string; billedOn: string; showroom: string | null; invoiced: number; paid: number; balance: number; status: string }[];
      total: number;
      totals: { invoiced: number; paid: number; balance: number };
    }>(`/api/reports/pending?books=${range.books}&page=${page}`);
    const start = (page - 1) * 50;
    return {
      note: bookNote(range.books),
      columns: ["Sl.no.", "Customer", "Showroom", "Bill no.", "Date", "Inv amount", "Paid", "Balance", "Status"],
      rows: data.pending.map((row, index) => [
        String(start + index + 1),
        row.customerName || "—",
        row.showroom || "—",
        row.billNo,
        row.billedOn,
        formatRupees(row.invoiced),
        formatRupees(row.paid),
        formatRupees(row.balance),
        billStatusLabel(row.status),
      ]),
      total: data.total,
      totalRow: [
        "Total",
        "",
        "",
        "",
        "",
        formatRupees(data.totals.invoiced),
        formatRupees(data.totals.paid),
        formatRupees(data.totals.balance),
        "",
      ],
    };
  }
  if (report === "mismatch") {
    const data = await apiFetch<{
      mismatches: { inventoryNo: string; productCode: string; productName: string; received: number; billed: number; onHand: number; difference: number }[];
    }>("/api/reports/mismatch");
    const received = sumQty(data.mismatches.map((row) => row.received));
    const billed = sumQty(data.mismatches.map((row) => row.billed));
    const onHand = sumQty(data.mismatches.map((row) => row.onHand));
    const difference = sumQty(data.mismatches.map((row) => row.difference));
    return {
      note: "Received is what came in on the number. Billed is the quantity on bills that were not cancelled. On hand is the shelf now. Difference is on hand minus (received − billed). Every inventory number is still on the stock list. This list only highlights the ones that do not add up. None of them have been changed.",
      columns: ["Inventory no.", "Code", "Product", "Received", "Billed", "On hand", "Difference"],
      rows: data.mismatches.map((row) => [
        row.inventoryNo,
        row.productCode,
        row.productName,
        String(row.received),
        String(row.billed),
        String(row.onHand),
        String(row.difference),
      ]),
      totalRow: ["Total", "", "", String(received), String(billed), String(onHand), String(difference)],
    };
  }
  const data = await apiFetch<{ returns: { billNo: string; billedOn: string; customerName: string; net: number; remarks: string | null }[] }>(
    `/api/reports/returns?${dates}`,
  );
  return {
    columns: ["Sl.no.", "Bill no.", "Date", "Customer", "Net", "Remarks"],
    rows: data.returns.map((row, index) => [
      String(index + 1),
      row.billNo,
      row.billedOn,
      row.customerName,
      formatRupees(row.net),
      row.remarks || "—",
    ]),
    totalRow: ["Total", "", "", "", formatRupees(sumRupees(data.returns.map((row) => row.net))), ""],
  };
}

function sumQty(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 1000) / 1000;
}

function sumRupees(values: number[]): number {
  return values.reduce((sum, value) => (Math.round(sum * 100) + Math.round(value * 100)) / 100, 0);
}

function downloadSheet(sheet: Sheet) {
  const lines = sheet.totalRow ? [sheet.columns, ...sheet.rows, sheet.totalRow] : [sheet.columns, ...sheet.rows];
  const csv = lines.map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "report.csv";
  link.click();
  URL.revokeObjectURL(url);
}
