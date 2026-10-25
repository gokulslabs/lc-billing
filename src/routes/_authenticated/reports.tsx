import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { monthStart } from "@/lib/reports";
import { shopToday } from "@/lib/sales";
import { formatRupees } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

function ReportsPage() {
  const today = shopToday();
  const [report, setReport] = useState<ReportId>("invoices");
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [date, setDate] = useState(today);
  const [applied, setApplied] = useState({ from: monthStart(today), to: today, date: today });
  const needsRange = report !== "collections" && report !== "pending" && report !== "mismatch";
  const needsDate = report === "collections";

  const result = useQuery({
    queryKey: ["reports", report, applied],
    queryFn: () => loadReport(report, applied),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div>
        <h1 className="text-4xl font-semibold">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">Bills, collections, pending payments, and stock.</p>
      </div>
      <Select value={report} onValueChange={(value) => setReport(value as ReportId)}>
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
      {needsRange || needsDate ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setApplied({ from, to, date });
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
      {result.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {result.error instanceof Error ? <p className="text-sm text-destructive">{result.error.message}</p> : null}
      {result.data ? <ReportTable sheet={result.data} /> : null}
    </div>
  );
}

type Sheet = { columns: string[]; rows: string[][] };

function ReportTable({ sheet }: { sheet: Sheet }) {
  return (
    <div className="space-y-3">
      {sheet.rows.length > 0 ? (
        <Button type="button" variant="outline" className="rounded-full" onClick={() => downloadSheet(sheet)}>
          Spreadsheet
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing in this report.</p>
      )}
      {sheet.rows.length > 0 ? (
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
          </Table>
        </div>
      ) : null}
    </div>
  );
}

async function loadReport(report: ReportId, range: { from: string; to: string; date: string }): Promise<Sheet> {
  const dates = `from=${range.from}&to=${range.to}`;
  if (report === "invoices") {
    const data = await apiFetch<{ invoices: { billNo: string; billedOn: string; customerName: string; gross: number; discount: number; net: number }[] }>(
      `/api/reports/invoices?${dates}`,
    );
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
    };
  }
  if (report === "collections") {
    const data = await apiFetch<{ collections: { showroom: string | null; billNo: string; paidOn: string; remarks: string | null; amount: number }[] }>(
      `/api/reports/collections?date=${range.date}`,
    );
    return {
      columns: ["Sl.no.", "Showroom", "Bill no.", "Date", "Payment mode", "Remarks", "Amount"],
      rows: data.collections.map((row, index) => [
        String(index + 1),
        row.showroom || "—",
        row.billNo,
        row.paidOn,
        "—",
        row.remarks || "—",
        formatRupees(row.amount),
      ]),
    };
  }
  if (report === "showrooms") {
    const data = await apiFetch<{ showrooms: { showroom: string | null; count: number; amount: number }[] }>(`/api/reports/showrooms?${dates}`);
    return {
      columns: ["Showroom", "Payments", "Amount"],
      rows: data.showrooms.map((row) => [row.showroom || "—", String(row.count), formatRupees(row.amount)]),
    };
  }
  if (report === "pending") {
    const data = await apiFetch<{ pending: { billNo: string; billedOn: string; showroom: string | null; invoiced: number; paid: number; balance: number }[] }>(
      "/api/reports/pending",
    );
    return {
      columns: ["Sl.no.", "Showroom", "Bill no.", "Date", "Inv amount", "Paid", "Balance"],
      rows: data.pending.map((row, index) => [
        String(index + 1),
        row.showroom || "—",
        row.billNo,
        row.billedOn,
        formatRupees(row.invoiced),
        formatRupees(row.paid),
        formatRupees(row.balance),
      ]),
    };
  }
  if (report === "mismatch") {
    const data = await apiFetch<{
      mismatches: { inventoryNo: string; productCode: string; productName: string; received: number; billed: number; onHand: number; difference: number }[];
    }>("/api/reports/mismatch");
    return {
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
  };
}

function downloadSheet(sheet: Sheet) {
  const csv = [sheet.columns, ...sheet.rows].map((line) => line.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "report.csv";
  link.click();
  URL.revokeObjectURL(url);
}
