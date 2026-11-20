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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
    queryFn: () =>
      apiFetch<Analytics>(
        `/api/reports/analytics?from=${encodeURIComponent(applied.from)}&to=${encodeURIComponent(applied.to)}`,
      ),
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
          <h2 className="text-xl font-semibold">Store overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sales and collections use the selected dates. Product sales and customer lifetime
            payments cover all available history; draft and cancelled bills are excluded. Stock
            value uses current selling prices.
          </p>
        </div>
        {analytics.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading analytics…</p>
        ) : analytics.error instanceof Error ? (
          <p className="text-sm text-destructive">{analytics.error.message}</p>
        ) : analytics.data ? (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="products">Products &amp; inventory</TabsTrigger>
              <TabsTrigger value="customers">Customers</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AnalyticsMetric
                  label="Bills in range"
                  value={String(analytics.data.summary.billCount)}
                />
                <AnalyticsMetric
                  label="Net sales in range"
                  value={formatRupees(analytics.data.summary.netSales)}
                />
                <AnalyticsMetric
                  label="Collected in range"
                  value={formatRupees(analytics.data.summary.collected)}
                />
                <AnalyticsMetric
                  label="Paying customers · lifetime"
                  value={String(analytics.data.summary.payingCustomers)}
                />
                <AnalyticsMetric
                  label="Styles in stock"
                  value={`${analytics.data.summary.stockedStyles} / ${analytics.data.summary.catalogueStyles}`}
                />
                <AnalyticsMetric
                  label="Stock value at retail price"
                  value={formatRupees(analytics.data.summary.retailStockValue)}
                />
                <AnalyticsMetric
                  label="Customers in database"
                  value={String(analytics.data.summary.customerCount)}
                />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="min-w-0 rounded-xl border border-border p-3 md:p-4">
                  <h3 className="font-medium">
                    Sales vs collections by {analytics.data.bucket === "month" ? "month" : "day"}
                  </h3>
                  {analytics.data.trend.length ? (
                    <ChartContainer
                      className="mt-3 h-[280px] w-full aspect-auto"
                      config={{
                        sales: { label: "Net sales", color: "var(--chart-1)" },
                        collected: { label: "Collected", color: "var(--chart-2)" },
                      }}
                    >
                      <BarChart data={analytics.data.trend} accessibilityLayer>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value: number) => compactRupees(value)}
                          width={72}
                        />
                        <ChartTooltip
                          content={
                            <ChartTooltipContent
                              formatter={(value) => formatRupees(Number(value))}
                            />
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
                  {analytics.data.paymentMethods.length ? (
                    <ChartContainer
                      className="mt-3 h-[280px] w-full aspect-auto"
                      config={{ collected: { label: "Collected", color: "var(--chart-3)" } }}
                    >
                      <BarChart data={analytics.data.paymentMethods} accessibilityLayer>
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
                            <ChartTooltipContent
                              formatter={(value) => formatRupees(Number(value))}
                            />
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
                    <p className="py-12 text-sm text-muted-foreground">
                      No payments in this range.
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>
            <TabsContent value="products" className="grid gap-4 xl:grid-cols-2">
              <TopListChart
                title="Best selling products · lifetime"
                emptyLabel="No billed products yet."
                data={analytics.data.topProducts.map((item) => ({
                  name: `${item.code} · ${item.name} (${item.unit})`,
                  amount: item.quantitySold,
                  detail: formatRupees(item.netSales),
                }))}
                valueLabel="Quantity sold"
                color="var(--chart-4)"
              />
              <TopListChart
                title="Current inventory value by product group"
                emptyLabel="No inventory groups yet."
                data={analytics.data.inventoryGroups.map((item) => ({
                  name: item.name,
                  amount: item.retailValue,
                  detail: `${item.stockedStyles} styles · ${item.quantity} units`,
                }))}
                valueLabel="Retail stock value"
                color="var(--chart-2)"
                currency
              />
            </TabsContent>
            <TabsContent value="customers" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <AnalyticsMetric
                  label="Paying customers · lifetime"
                  value={String(analytics.data.summary.payingCustomers)}
                />
                <AnalyticsMetric
                  label="Customers in database"
                  value={String(analytics.data.summary.customerCount)}
                />
              </div>
              <TopListChart
                title="Highest paying customers · lifetime"
                emptyLabel="No customer payments yet."
                data={analytics.data.topCustomers.map((item) => ({
                  name: item.name,
                  amount: item.collected,
                  detail: `${item.billCount} bills · ${formatRupees(item.netSales)} sales`,
                }))}
                valueLabel="Total paid"
                color="var(--chart-5)"
                currency
              />
            </TabsContent>
          </Tabs>
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
  summary: {
    billCount: number;
    netSales: number;
    collected: number;
    stockedStyles: number;
    catalogueStyles: number;
    retailStockValue: number;
    payingCustomers: number;
    customerCount: number;
  };
  bucket: "day" | "month";
  trend: { date: string; label: string; sales: number; collected: number }[];
  paymentMethods: { method: string; collected: number }[];
  topProducts: {
    code: string;
    name: string;
    unit: string;
    quantitySold: number;
    netSales: number;
  }[];
  topCustomers: { name: string; billCount: number; netSales: number; collected: number }[];
  inventoryGroups: {
    name: string;
    stockedStyles: number;
    quantity: number;
    retailValue: number;
  }[];
};

function AnalyticsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function TopListChart({
  title,
  emptyLabel,
  data,
  valueLabel,
  color,
  currency = false,
}: {
  title: string;
  emptyLabel: string;
  data: { name: string; amount: number; detail: string }[];
  valueLabel: string;
  color: string;
  currency?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border p-3 md:p-4">
      <h3 className="font-medium">{title}</h3>
      {data.length ? (
        <ChartContainer
          className="mt-3 h-[320px] w-full aspect-auto"
          config={{ amount: { label: valueLabel, color } }}
        >
          <BarChart
            data={data}
            layout="vertical"
            accessibilityLayer
            margin={{ left: 4, right: 16 }}
          >
            <CartesianGrid horizontal={false} />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: number) =>
                currency ? compactRupees(value) : Number(value).toLocaleString("en-IN")
              }
            />
            <YAxis
              type="category"
              dataKey="name"
              width={124}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value: string) =>
                value.length > 18 ? `${value.slice(0, 17)}…` : value
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelKey="name"
                  formatter={(value) =>
                    currency ? formatRupees(Number(value)) : Number(value).toLocaleString("en-IN")
                  }
                />
              }
            />
            <Bar dataKey="amount" fill="var(--color-amount)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartContainer>
      ) : (
        <p className="py-12 text-sm text-muted-foreground">{emptyLabel}</p>
      )}
      {data.length ? (
        <div className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {data.slice(0, 3).map((item) => (
            <p key={item.name} className="truncate">
              <span className="font-medium text-foreground">{item.name}:</span> {item.detail}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
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
