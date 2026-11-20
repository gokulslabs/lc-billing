import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { apiFetch } from "@/lib/api";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
import { PrintTableButton } from "@/components/app/PrintTableButton";
import { ListFooter } from "@/components/app/ListFooter";
import { monthStart } from "@/lib/reports";
import { billStatusLabel, paymentModeLabel, shopToday } from "@/lib/sales";
import { formatRupees } from "@/lib/products";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Ladies Collections" },
      {
        name: "description",
        content:
          "Invoice, collection, pending, mismatch, and return reports for Ladies Collections.",
      },
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
  invoices:
    "One row per bill in the dates, excluding drafts and cancelled bills. Gross, discount and net are on the bill. For legacy comparisons, use these bill-level discounts: the old site's date report was observed to show ₹0 discounts and gross as net; verify older totals against the bill details or this report.",
  items: "One row per line on those bills. This is the same list as Extract, without the customer.",
  extract: "The same lines as Items, with the customer name added.",
  collections: "Payments taken on the chosen date, one row per payment.",
  showrooms:
    "Each payment in the dates, with its date, bill, customer and method. Showroom is the note on that payment.",
  pending:
    "Bills in the chosen book that still have a balance. The total is the whole book, not only this page.",
  mismatch:
    "Inventory numbers whose shelf quantity does not equal what was received minus what was billed. Matching numbers stay on the stock list.",
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
  const [applied, setApplied] = useState({
    from: monthStart(today),
    to: today,
    date: today,
    books: "new" as "new" | "old",
  });
  function applyRange(start: string, end = today) {
    setFrom(start);
    setTo(end);
    setApplied((current) => ({ ...current, from: start, to: end }));
    setPage(1);
  }
  const lastWeek = dateOffset(today, -7);
  const yesterday = dateOffset(today, -1);
  const lastMonth = previousMonth(today);
  const needsRange = report !== "collections" && report !== "pending" && report !== "mismatch";
  const needsDate = report === "collections";

  const result = useQuery({
    queryKey: ["reports", report, applied, page],
    queryFn: () => loadReport(report, applied, page),
  });
  const analytics = useQuery({
    queryKey: ["report-analytics", applied.from, applied.to],
    queryFn: async () => {
      const dates = `from=${encodeURIComponent(applied.from)}&to=${encodeURIComponent(applied.to)}`;
      const [invoiceData, paymentData] = await Promise.all([
        apiFetch<{
          invoices: { billedOn: string; net: number }[];
        }>(`/api/reports/invoices?${dates}`),
        apiFetch<{
          payments: { paidOn: string; mode: string | null; amount: number }[];
        }>(`/api/reports/showrooms?${dates}`),
      ]);
      return summarizeAnalytics(invoiceData.invoices, paymentData.payments);
    },
  });

  return (
    <div className="mx-auto max-w-[100rem] space-y-8 p-6 md:p-10">
      <div>
        <h1 className="text-4xl font-semibold">Reports</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Bills, collections, pending payments, and stock.
        </p>
      </div>
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
        <div>
          <h2 className="text-xl font-semibold">Business analytics</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Net sales and collected payments for {legacyReportDate(applied.from)} to{" "}
            {legacyReportDate(applied.to)}. Change the date range below to compare another period.
          </p>
        </div>
        {analytics.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading analytics…</p>
        ) : analytics.error instanceof Error ? (
          <p className="text-sm text-destructive">{analytics.error.message}</p>
        ) : analytics.data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <AnalyticsMetric label="Bills" value={String(analytics.data.billCount)} />
              <AnalyticsMetric label="Net sales" value={formatRupees(analytics.data.netSales)} />
              <AnalyticsMetric
                label="Collected"
                value={formatRupees(analytics.data.totalCollected)}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <div className="min-w-0 rounded-xl border border-border p-3 md:p-4">
                <h3 className="font-medium">
                  Sales vs collections {analytics.data.bucket === "month" ? "by month" : "by day"}
                </h3>
                {analytics.data.daily.length ? (
                  <ChartContainer
                    className="mt-3 h-[280px] w-full aspect-auto"
                    config={{
                      sales: { label: "Net sales", color: "var(--chart-1)" },
                      collected: { label: "Collected", color: "var(--chart-2)" },
                    }}
                  >
                    <BarChart data={analytics.data.daily} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="day" tickLine={false} axisLine={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => compactRupees(value)}
                        width={72}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent formatter={(value) => formatRupees(Number(value))} />
                        }
                      />
                      <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
                      <Bar
                        dataKey="collected"
                        fill="var(--color-collected)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="py-12 text-sm text-muted-foreground">
                    No sales or collections in this range.
                  </p>
                )}
              </div>
              <div className="min-w-0 rounded-xl border border-border p-3 md:p-4">
                <h3 className="font-medium">Collections by payment method</h3>
                {analytics.data.methods.length ? (
                  <ChartContainer
                    className="mt-3 h-[280px] w-full aspect-auto"
                    config={{ collected: { label: "Collected", color: "var(--chart-3)" } }}
                  >
                    <BarChart data={analytics.data.methods} accessibilityLayer>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="method" tickLine={false} axisLine={false} />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => compactRupees(value)}
                        width={72}
                      />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent formatter={(value) => formatRupees(Number(value))} />
                        }
                      />
                      <Bar
                        dataKey="collected"
                        fill="var(--color-collected)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <p className="py-12 text-sm text-muted-foreground">No payments in this range.</p>
                )}
              </div>
            </div>
          </>
        ) : null}
      </section>
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
              <Input
                id="report-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={
                    applied.from === yesterday && applied.to === yesterday ? "default" : "outline"
                  }
                  className="rounded-full"
                  onClick={() => applyRange(yesterday, yesterday)}
                >
                  Yesterday
                </Button>
                <Button
                  type="button"
                  variant={
                    applied.from === lastWeek && applied.to === today ? "default" : "outline"
                  }
                  className="rounded-full"
                  onClick={() => applyRange(lastWeek)}
                >
                  Last 7 days
                </Button>
                <Button
                  type="button"
                  variant={
                    applied.from === lastMonth.from && applied.to === lastMonth.to
                      ? "default"
                      : "outline"
                  }
                  className="rounded-full"
                  onClick={() => applyRange(lastMonth.from, lastMonth.to)}
                >
                  Last month
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-from">From date</Label>
                <Input
                  id="report-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-to">To date</Label>
                <Input
                  id="report-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  required
                />
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
      {result.error instanceof Error ? (
        <p className="text-sm text-destructive">{result.error.message}</p>
      ) : null}
      {result.data?.note ? (
        <p className="text-sm text-muted-foreground">{result.data.note}</p>
      ) : null}
      {result.data ? (
        <ReportTable
          sheet={result.data}
          report={report}
          period={
            needsDate
              ? `Date : ${legacyReportDate(applied.date)}`
              : needsRange
                ? `From date : ${legacyReportDate(applied.from)}\nTo date : ${legacyReportDate(applied.to)}`
                : undefined
          }
          {...(report === "pending"
            ? { onExport: () => loadReport("pending", applied, 1, true) }
            : {})}
        />
      ) : null}
      {report === "pending" && result.data ? (
        <ListFooter
          page={page}
          total={result.data.total ?? 0}
          shown={result.data.rows.length}
          onPage={setPage}
        />
      ) : null}
    </div>
  );
}

type SheetCell = string | number;
type Sheet = {
  columns: string[];
  rows: SheetCell[][];
  note?: string;
  totalRow?: SheetCell[];
  total?: number;
};

type Analytics = {
  billCount: number;
  netSales: number;
  totalCollected: number;
  bucket: "day" | "month";
  daily: { day: string; sales: number; collected: number }[];
  methods: { method: string; collected: number }[];
};

function AnalyticsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function summarizeAnalytics(
  invoices: { billedOn: string; net: number }[],
  payments: { paidOn: string; mode: string | null; amount: number }[],
): Analytics {
  const daySales = new Map<string, number>();
  const dayCollected = new Map<string, number>();
  const methodTotals = new Map<string, number>();
  for (const invoice of invoices) {
    const key = invoice.billedOn.slice(0, 10);
    daySales.set(key, (daySales.get(key) ?? 0) + Math.round(invoice.net * 100));
  }
  for (const payment of payments) {
    const key = payment.paidOn.slice(0, 10);
    const cents = Math.round(payment.amount * 100);
    dayCollected.set(key, (dayCollected.get(key) ?? 0) + cents);
    const method = paymentModeLabel(payment.mode);
    methodTotals.set(method, (methodTotals.get(method) ?? 0) + cents);
  }
  const allDays = [...new Set([...daySales.keys(), ...dayCollected.keys()])].sort();
  const first = allDays[0];
  const last = allDays.at(-1);
  const start = first ? new Date(`${first}T00:00:00Z`).getTime() : 0;
  const end = last ? new Date(`${last}T00:00:00Z`).getTime() : 0;
  const bucket = end - start > 62 * 24 * 60 * 60 * 1000 ? "month" : "day";
  const trend = new Map<string, { day: string; sales: number; collected: number }>();
  for (const day of allDays) {
    const key = bucket === "month" ? day.slice(0, 7) : day;
    const current = trend.get(key) ?? {
      day: bucket === "month" ? monthLabel(key) : shortDayLabel(day),
      sales: 0,
      collected: 0,
    };
    current.sales += daySales.get(day) ?? 0;
    current.collected += dayCollected.get(day) ?? 0;
    trend.set(key, current);
  }
  const toRupees = (cents: number) => Math.round(cents) / 100;
  return {
    billCount: invoices.length,
    netSales: toRupees(invoices.reduce((sum, invoice) => sum + Math.round(invoice.net * 100), 0)),
    totalCollected: toRupees([...methodTotals.values()].reduce((sum, amount) => sum + amount, 0)),
    bucket,
    daily: [...trend.values()].map((row) => ({
      ...row,
      sales: toRupees(row.sales),
      collected: toRupees(row.collected),
    })),
    methods: [...methodTotals.entries()]
      .map(([method, amount]) => ({ method, collected: toRupees(amount) }))
      .sort((a, b) => b.collected - a.collected),
  };
}

function shortDayLabel(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function monthLabel(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00Z`));
}

function compactRupees(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `₹${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(0)}k`;
  return `₹${value}`;
}

const MONEY = new Set([
  "Gross",
  "Disc.",
  "Net",
  "Rate",
  "Amount",
  "Inv amount",
  "Paid",
  "Balance",
  "Gross Amount",
  "Disc. Amount",
  "Net Amount",
]);

function legacyReportDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

function showCell(column: string, value: SheetCell): string {
  if (typeof value !== "number") return value;
  return MONEY.has(column) ? formatRupees(value) : String(value);
}

function ReportTable({
  sheet,
  report,
  period,
  onExport,
}: {
  sheet: Sheet;
  report: ReportId;
  period: string | undefined;
  onExport?: () => Promise<Sheet>;
}) {
  const label = REPORTS.find((entry) => entry.id === report)?.label ?? "Report";
  const title = [label, period].filter(Boolean).join(" — ");
  return (
    <div className="space-y-3">
      {sheet.rows.length > 0 || sheet.totalRow ? (
        <div className="flex flex-wrap gap-2">
          <ExportExcelButton
            filename={[report, period?.replaceAll(/[\s:]+/g, "-")].filter(Boolean).join("-")}
            load={async () => {
              const chosen = onExport ? await onExport() : sheet;
              return [
                {
                  name: "Report",
                  columns: chosen.columns,
                  rows: [...chosen.rows, ...(chosen.totalRow ? [chosen.totalRow] : [])],
                },
              ];
            }}
          />
          <PrintTableButton
            title={label}
            load={async () => {
              const chosen = onExport ? await onExport() : sheet;
              return {
                columns: chosen.columns,
                lines: period ? period.split("\n") : [],
                rows: [...chosen.rows, ...(chosen.totalRow ? [chosen.totalRow] : [])],
              };
            }}
          />
        </div>
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
                    <TableCell
                      key={cellIndex}
                      className={cellIndex === 0 ? "font-medium" : undefined}
                    >
                      {showCell(sheet.columns[cellIndex] ?? "", cell)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            {sheet.totalRow ? (
              <TableFooter>
                <TableRow>
                  {sheet.totalRow.map((cell, cellIndex) => (
                    <TableCell key={cellIndex}>
                      {showCell(sheet.columns[cellIndex] ?? "", cell)}
                    </TableCell>
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

function dateOffset(today: string, days: number): string {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function previousMonth(today: string): { from: string; to: string } {
  const [year = 0, month = 1] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 2, 1, 12));
  const end = new Date(Date.UTC(year, month - 1, 0, 12));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

function bookNote(books: "new" | "old"): string {
  return books === "old"
    ? "Old book — copied balances. Every bill dated before 26 Oct 2026 that still has a balance is here. The total is every bill in this book, not only this page. The live book is the other choice. Do not add the two lists together."
    : "Live book. Every bill from 26 Oct 2026 that still has a balance is here. The total is every bill in this book, not only this page. Old book — copied balances is the other choice. Do not add the two lists together.";
}

async function loadReport(
  report: ReportId,
  range: { from: string; to: string; date: string; books: "new" | "old" },
  page: number,
  full = false,
): Promise<Sheet> {
  const dates = `from=${range.from}&to=${range.to}`;
  if (report === "invoices") {
    const data = await apiFetch<{
      invoices: {
        billNo: string;
        billedOn: string;
        customerName: string;
        gross: number;
        discount: number;
        net: number;
      }[];
    }>(`/api/reports/invoices?${dates}`);
    const gross = sumRupees(data.invoices.map((row) => row.gross));
    const discount = sumRupees(data.invoices.map((row) => row.discount));
    const net = sumRupees(data.invoices.map((row) => row.net));
    return {
      columns: [
        "Sl.No.",
        "Invoice No.",
        "Date",
        "Customer Name",
        "Gross Amount",
        "Disc. Amount",
        "Net Amount",
      ],
      rows: data.invoices.map((row, index) => [
        index + 1,
        row.billNo,
        legacyReportDate(row.billedOn),
        row.customerName,
        row.gross,
        row.discount,
        row.net,
      ]),
      totalRow: ["Total", "", "", "", gross, discount, net],
    };
  }
  if (report === "items" || report === "extract") {
    const path = report === "items" ? "items" : "extract";
    const key = report === "items" ? "items" : "rows";
    const data = await apiFetch<
      Record<
        string,
        {
          billNo: string;
          billedOn: string;
          customerName: string | null;
          inventoryNo: string;
          productCode: string;
          productName: string;
          quantity: number;
          rate: number;
          amount: number;
        }[]
      >
    >(`/api/reports/${path}?${dates}`);
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
        index + 1,
        "—",
        row.billNo,
        row.billedOn,
        ...(withCustomer ? [row.customerName || "—"] : []),
        row.inventoryNo,
        row.productCode,
        row.productName,
        "—",
        row.quantity,
        row.rate,
        row.amount,
      ]),
      totalRow: [
        "Total",
        "",
        "",
        "",
        ...(withCustomer ? [""] : []),
        "",
        "",
        "",
        "",
        quantity,
        "",
        amount,
      ],
    };
  }
  if (report === "collections") {
    const data = await apiFetch<{
      collections: {
        showroom: string | null;
        billNo: string;
        paidOn: string;
        remarks: string | null;
        mode: string | null;
        amount: number;
      }[];
    }>(`/api/reports/collections?date=${range.date}`);
    return {
      columns: ["Sl No.", "Show Room", "Bill No.", "Date", "Payment Mode", "Remarks", "Amount"],
      rows: data.collections.map((row, index) => [
        index + 1,
        row.showroom || "",
        row.billNo,
        legacyReportDate(row.paidOn),
        paymentModeLabel(row.mode),
        row.remarks || "—",
        row.amount,
      ]),
      totalRow: ["Total", "", "", "", "", "", sumRupees(data.collections.map((row) => row.amount))],
    };
  }
  if (report === "showrooms") {
    const data = await apiFetch<{
      payments: {
        paidOn: string;
        billNo: string;
        customerName: string;
        mode: string | null;
        showroom: string | null;
        amount: number;
      }[];
    }>(`/api/reports/showrooms?${dates}`);
    return {
      columns: ["Date", "Bill no.", "Customer", "Method", "Showroom", "Amount"],
      rows: data.payments.map((row) => [
        row.paidOn,
        row.billNo || "—",
        row.customerName || "—",
        paymentModeLabel(row.mode),
        row.showroom || "—",
        row.amount,
      ]),
      totalRow: ["Total", "", "", "", "", sumRupees(data.payments.map((row) => row.amount))],
    };
  }
  if (report === "pending") {
    const data = await apiFetch<{
      pending: {
        customerName: string;
        billNo: string;
        billedOn: string;
        showroom: string | null;
        invoiced: number;
        paid: number;
        balance: number;
        status: string;
      }[];
      total: number;
      totals: { invoiced: number; paid: number; balance: number };
    }>(
      `/api/reports/pending?books=${range.books}&page=${full ? 1 : page}${full ? "&export=1" : ""}`,
    );
    const start = full ? 0 : (page - 1) * 50;
    return {
      note: bookNote(range.books),
      columns: [
        "Sl.no.",
        "Customer",
        "Showroom",
        "Bill no.",
        "Date",
        "Inv amount",
        "Paid",
        "Balance",
        "Status",
      ],
      rows: data.pending.map((row, index) => [
        start + index + 1,
        row.customerName || "—",
        row.showroom || "—",
        row.billNo,
        row.billedOn,
        row.invoiced,
        row.paid,
        row.balance,
        billStatusLabel(row.status),
      ]),
      total: data.total,
      totalRow: [
        "Total",
        "",
        "",
        "",
        "",
        data.totals.invoiced,
        data.totals.paid,
        data.totals.balance,
        "",
      ],
    };
  }
  if (report === "mismatch") {
    const data = await apiFetch<{
      mismatches: {
        inventoryNo: string;
        productCode: string;
        productName: string;
        received: number;
        billed: number;
        onHand: number;
        difference: number;
      }[];
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
        row.received,
        row.billed,
        row.onHand,
        row.difference,
      ]),
      totalRow: ["Total", "", "", received, billed, onHand, difference],
    };
  }
  const data = await apiFetch<{
    returns: {
      billNo: string;
      billedOn: string;
      customerName: string;
      net: number;
      remarks: string | null;
    }[];
  }>(`/api/reports/returns?${dates}`);
  return {
    columns: ["Sl.no.", "Bill no.", "Date", "Customer", "Net", "Remarks"],
    rows: data.returns.map((row, index) => [
      index + 1,
      row.billNo,
      row.billedOn,
      row.customerName,
      row.net,
      row.remarks || "—",
    ]),
    totalRow: ["Total", "", "", "", sumRupees(data.returns.map((row) => row.net)), ""],
  };
}

function sumQty(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 1000) / 1000;
}

function sumRupees(values: number[]): number {
  return values.reduce((sum, value) => (Math.round(sum * 100) + Math.round(value * 100)) / 100, 0);
}
