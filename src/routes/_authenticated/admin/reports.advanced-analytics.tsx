import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Search } from "lucide-react";
import type { ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { downloadExcel, type ExcelSheet } from "@/lib/excel";
import { shopToday } from "@/lib/sales";
import { formatRupees } from "@/lib/products";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/reports/advanced-analytics")({
  head: () => ({ meta: [{ title: "Advanced Analytics — Ladies Collections" }] }),
  component: AdvancedAnalyticsPage,
});

type Section = "overview" | "customers" | "sales" | "inventory" | "stitching";
type AnalyticsRow = {
  [key: string]: unknown;
  id?: string;
  name?: string;
  spend?: number | string;
  visit_days?: number;
  bill_count?: number;
  first_purchase?: string;
  last_purchase?: string;
  average_bill_value?: number | string;
  outstanding?: number | string;
  customer_type?: string;
  bill_no?: string;
  billed_on?: string;
  customer_id?: string;
  customer_name?: string;
  gross?: number | string;
  discount?: number | string;
  net?: number | string;
  code?: string;
  group_name?: string;
  unit?: string;
  available_quantity?: number | string;
  retail_value?: number | string;
  cost_covered_items?: number;
  stock_items?: number;
  quantity_sold?: number | string;
  net_sales?: number | string;
  order_no?: string;
  garment?: string;
  ordered_on?: string;
  delivery_on?: string | null;
  status?: string;
  amount?: number | string;
  method?: string;
  inventory_no?: string;
  received?: number | string;
  billed?: number | string;
  on_hand?: number | string;
  difference?: number | string;
  stocked_products?: number;
  slow_moving?: boolean;
  received_count?: number;
  pending_count?: number;
  overdue_count?: number;
  ready_count?: number;
  delivered_count?: number;
  pending?: number;
  ready?: number;
  delivered?: number;
  overdue?: boolean | number;
  legacy_pending?: boolean;
  pieces_sold?: number | string;
  metres_sold?: number | string;
};
type Metrics = {
  net_sales?: number;
  collected?: number;
  outstanding_balance?: number;
  bill_count?: number;
  average_bill_value?: number;
  customers?: number;
  returning_customers?: number;
  grossSales?: number;
  discounts?: number;
  netSales?: number;
  collections?: number;
  cancelledBillValue?: number;
  salesReturnCredits?: number;
  retailValue?: number;
  productsInStock?: number;
  productsWithoutSales?: number;
  slowMovingProducts?: number;
  reconciliationFlags?: number;
  costCoveredItems?: number;
  stockItems?: number;
  received?: number;
  pending?: number;
  overdue?: number;
  ready?: number;
  delivered?: number;
  legacyPending?: number;
};
type TrendPoint = { [key: string]: unknown; date: string; sales: number; collected: number };
type Payload = {
  summary?: Metrics;
  previous?: Metrics;
  trend?: TrendPoint[];
  weeklyTrend?: TrendPoint[];
  monthlyTrend?: TrendPoint[];
  rows?: AnalyticsRow[];
  bills?: AnalyticsRow[];
  groups?: AnalyticsRow[];
  products?: AnalyticsRow[];
  productsByQuantity?: AnalyticsRow[];
  topSpend?: AnalyticsRow[];
  topVisitDays?: AnalyticsRow[];
  topBills?: AnalyticsRow[];
  methods?: AnalyticsRow[];
  stockFlags?: AnalyticsRow[];
  topSelling?: AnalyticsRow[];
  garments?: AnalyticsRow[];
  groupTotal?: number;
  productTotal?: number;
  stockFlagTotal?: number;
  total?: number;
  billTotal?: number;
  aging?: Record<string, number | string>;
};
const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "customers", label: "Customers" },
  { id: "sales", label: "Sales & collections" },
  { id: "inventory", label: "Inventory" },
  { id: "stitching", label: "Stitching" },
];

function AdvancedAnalyticsPage() {
  const today = shopToday();
  const [section, setSection] = useState<Section>("overview");
  const [preset, setPreset] = useState("This Month");
  const [from, setFrom] = useState(today.slice(0, 7) + "-01");
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState({ from: today.slice(0, 7) + "-01", to: today });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [trend, setTrend] = useState<"day" | "week" | "month">("day");
  const [exportBusy, setExportBusy] = useState(false);
  const isAdmin = useIsAdmin();
  const params = new URLSearchParams({
    from: applied.from,
    to: applied.to,
    section,
    page: String(page),
    pageSize: "25",
    search,
  });
  const query = useQuery({
    queryKey: ["advanced-analytics", section, applied, page, search],
    queryFn: () => apiFetch<Payload>(`/api/reports/advanced-analytics?${params}`),
  });
  const data = query.data;
  const rows: AnalyticsRow[] = useMemo(
    () => (section === "sales" ? (data?.bills ?? []) : (data?.rows ?? [])),
    [data, section],
  );
  const total =
    section === "sales"
      ? Math.max(data?.billTotal ?? 0, data?.groupTotal ?? 0, data?.productTotal ?? 0)
      : section === "inventory"
        ? Math.max(data?.total ?? 0, data?.stockFlagTotal ?? 0)
        : (data?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / 25));

  function choosePreset(value: string) {
    setPreset(value);
    if (value === "Custom") return;
    const end = today;
    const start =
      value === "Today"
        ? today
        : value === "Last 7 Days"
          ? offsetDate(today, -6)
          : value === "Last Month"
            ? monthStart(offsetDate(monthStart(today), -1))
            : monthStart(today);
    const finish = value === "Last Month" ? offsetDate(monthStart(today), -1) : end;
    setFrom(start);
    setTo(finish);
    setApplied({ from: start, to: finish });
    setPage(1);
  }
  function applyCustom() {
    setApplied({ from, to });
    setPage(1);
  }

  async function exportCurrent() {
    const all: AnalyticsRow[] = [];
    for (let next = 1; next <= Math.ceil(total / 100); next += 1) {
      const q = new URLSearchParams({
        from: applied.from,
        to: applied.to,
        section,
        page: String(next),
        pageSize: "100",
        search,
        export: "1",
      });
      const result = await apiFetch<Payload>(`/api/reports/advanced-analytics?${q}`);
      all.push(...(section === "sales" ? (result.bills ?? []) : (result.rows ?? [])));
    }
    const sheets: ExcelSheet[] = [];
    if (section === "overview" && data) {
      sheets.push({
        name: "Overview",
        columns: ["Metric", "Selected period", "Previous period"],
        rows: [
          ["Net sales", data.summary?.net_sales ?? 0, data.previous?.net_sales ?? 0],
          ["Money collected", data.summary?.collected ?? 0, data.previous?.collected ?? 0],
          ["Outstanding at period end", data.summary?.outstanding_balance ?? 0, ""],
          ["Bill count", data.summary?.bill_count ?? 0, data.previous?.bill_count ?? 0],
          ["Billed customers", data.summary?.customers ?? 0, ""],
          ["Repeat customers", data.summary?.returning_customers ?? 0, ""],
        ],
      });
      sheets.push(
        makeSheet(
          "Trend",
          (data.trend ?? []).map((point) => ({ ...point })),
        ),
      );
    } else {
      sheets.push(makeSheet(section, all));
      if (section === "sales" && data) {
        const groupRows: AnalyticsRow[] = [];
        const productRows: AnalyticsRow[] = [];
        const groupPages = Math.ceil((data.groupTotal ?? 0) / 100);
        const productPages = Math.ceil((data.productTotal ?? 0) / 100);
        for (let current = 1; current <= Math.max(groupPages, productPages); current += 1) {
          const q = new URLSearchParams({
            from: applied.from,
            to: applied.to,
            section,
            page: String(current),
            pageSize: "100",
            search,
            export: "1",
          });
          const result = await apiFetch<Payload>(`/api/reports/advanced-analytics?${q}`);
          groupRows.push(...(result.groups ?? []));
          productRows.push(...(result.products ?? []));
        }
        sheets.push(makeSheet("Groups", groupRows));
        sheets.push(makeSheet("Products", productRows));
        sheets.push(makeSheet("Top quantity", data.productsByQuantity ?? []));
        sheets.push(makeSheet("Payment methods", data.methods ?? []));
        sheets.push(
          makeSheet(
            "Outstanding age",
            Object.entries(data.aging ?? {}).map(([age, balance]) => ({ age, balance })),
          ),
        );
        sheets.push({
          name: "Summary",
          columns: ["Metric", "Amount"],
          rows: [
            ["Gross sales", data.summary?.grossSales ?? 0],
            ["Discounts", data.summary?.discounts ?? 0],
            ["Net billed sales", data.summary?.netSales ?? 0],
            ["Collections received", data.summary?.collections ?? 0],
            ["Sales return credits", data.summary?.salesReturnCredits ?? 0],
            ["Cancelled bill value", data.summary?.cancelledBillValue ?? 0],
          ],
        });
      }
      if (section === "inventory" && data) {
        const flags: AnalyticsRow[] = [];
        for (
          let current = 1;
          current <= Math.ceil((data.stockFlagTotal ?? 0) / 100);
          current += 1
        ) {
          const q = new URLSearchParams({
            from: applied.from,
            to: applied.to,
            section,
            page: String(current),
            pageSize: "100",
            search,
            export: "1",
          });
          const result = await apiFetch<Payload>(`/api/reports/advanced-analytics?${q}`);
          flags.push(...(result.stockFlags ?? []));
        }
        sheets.push(makeSheet("Stock flags", flags));
        sheets.push(makeSheet("Groups", data.groups ?? []));
        sheets.push(makeSheet("Top selling", data.topSelling ?? []));
      }
      if (section === "customers" && data) {
        sheets.push(makeSheet("Top spend", data.topSpend ?? []));
        sheets.push(makeSheet("Top visit days", data.topVisitDays ?? []));
        sheets.push(makeSheet("Top bills", data.topBills ?? []));
      }
      if (section === "stitching" && data) sheets.push(makeSheet("Garments", data.garments ?? []));
    }
    downloadExcel(`advanced-analytics-${section}-${applied.from}-to-${applied.to}`, sheets);
  }

  return (
    <main className="mx-auto w-full max-w-[100rem] space-y-5 px-4 py-6 md:px-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/admin/reports" className="underline">
              Reports
            </Link>{" "}
            / Advanced Analytics
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold">Advanced Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Business performance from recorded bills, payments, stock, and stitching orders.
          </p>
        </div>
        {isAdmin ? (
          <Button
            variant="outline"
            className="rounded-full"
            disabled={query.isLoading || exportBusy}
            onClick={() => {
              setExportBusy(true);
              void exportCurrent()
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not export analytics.",
                  ),
                )
                .finally(() => setExportBusy(false));
            }}
          >
            <Download className="mr-2 h-4 w-4" />
            {exportBusy ? "Preparing…" : "Export filtered data"}
          </Button>
        ) : null}
      </div>

      <section className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {["Today", "Last 7 Days", "This Month", "Last Month", "Custom"].map((item) => (
            <Button
              key={item}
              size="sm"
              variant={preset === item ? "default" : "outline"}
              className="rounded-full"
              onClick={() => choosePreset(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div>
            <Label htmlFor="analytics-from">From</Label>
            <Input
              id="analytics-from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("Custom");
              }}
            />
          </div>
          <div>
            <Label htmlFor="analytics-to">To</Label>
            <Input
              id="analytics-to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("Custom");
              }}
            />
          </div>
          {preset === "Custom" && (
            <Button onClick={applyCustom} className="rounded-full">
              Apply
            </Button>
          )}
        </div>
        <p className="w-full text-xs text-muted-foreground">
          Dates use Asia/Kolkata business days. Stock totals are a current snapshot; sales and order
          activity follow the selected dates.
        </p>
      </section>

      <Tabs
        value={section}
        onValueChange={(value) => {
          setSection(value as Section);
          setPage(1);
          setSearch("");
        }}
      >
        <TabsList className="h-auto flex-wrap justify-start">
          {SECTIONS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {SECTIONS.map((item) => (
          <TabsContent key={item.id} value={item.id} className="mt-5 space-y-5">
            {query.isLoading ? (
              <div className="rounded-2xl border p-10 text-center text-muted-foreground">
                Loading analytics…
              </div>
            ) : query.isError ? (
              <div role="alert" className="rounded-2xl border border-destructive/40 p-6">
                Could not load analytics. Please retry.
              </div>
            ) : data ? (
              <>
                {item.id === "overview" ? (
                  <Overview data={data} trend={trend} setTrend={setTrend} />
                ) : null}
                {item.id === "sales" ? <SalesSummary data={data} /> : null}
                {item.id === "inventory" ? <InventorySummary data={data} /> : null}
                {item.id === "stitching" ? <StitchingSummary data={data} /> : null}
                {item.id === "customers" ? <CustomerSummary data={data} /> : null}
                {item.id !== "overview" && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative w-full max-w-sm">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        className="pl-9"
                        placeholder={`Search ${item.label.toLowerCase()}`}
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPage(1);
                        }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {total.toLocaleString()} matching rows
                    </p>
                  </div>
                )}
                {item.id === "customers" ? <CustomerTable rows={rows} /> : null}
                {item.id === "sales" ? <SalesTable rows={rows} /> : null}
                {item.id === "sales" && data.groups?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Product groups</h2>
                    <DataTable
                      headers={["Group", "Net sales", "Pieces sold", "Metres sold"]}
                      rows={data.groups.map((r) => [
                        String(r.name ?? ""),
                        formatRupees(Number(r.net_sales ?? 0)),
                        Number(r.pieces_sold ?? 0),
                        Number(r.metres_sold ?? 0),
                      ])}
                    />
                  </section>
                ) : null}
                {item.id === "sales" && data.products?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Product codes</h2>
                    <DataTable
                      headers={["Product code", "Product", "Unit", "Quantity sold", "Net sales"]}
                      rows={data.products.map((r) => [
                        String(r.code ?? ""),
                        String(r.name ?? ""),
                        String(r.unit ?? ""),
                        `${r.quantity_sold ?? 0} ${r.unit ?? ""}`,
                        formatRupees(Number(r.net_sales ?? 0)),
                      ])}
                    />
                  </section>
                ) : null}
                {item.id === "sales" && data.productsByQuantity?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Top product codes by quantity</h2>
                    <DataTable
                      headers={["Product code", "Product", "Unit", "Quantity sold"]}
                      rows={data.productsByQuantity.map((r) => [
                        String(r.code ?? ""),
                        String(r.name ?? ""),
                        String(r.unit ?? ""),
                        `${r.quantity_sold ?? 0} ${r.unit ?? ""}`,
                      ])}
                    />
                  </section>
                ) : null}
                {item.id === "sales" && data.methods?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Collections by payment method</h2>
                    <DataTable
                      headers={["Method", "Collected"]}
                      rows={data.methods.map((r) => [
                        String(r.method ?? "Not recorded"),
                        formatRupees(Number(r.amount ?? 0)),
                      ])}
                    />
                  </section>
                ) : null}
                {item.id === "inventory" ? <InventoryTable rows={rows} /> : null}
                {item.id === "inventory" && data.groups?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Available stock by group and unit</h2>
                    <DataTable
                      headers={[
                        "Group",
                        "Unit",
                        "Available quantity",
                        "Stocked products",
                        "Retail value",
                      ]}
                      rows={data.groups.map((r) => [
                        String(r.group_name ?? ""),
                        String(r.unit ?? ""),
                        `${r.available_quantity ?? 0} ${r.unit ?? ""}`,
                        Number(r.stocked_products ?? 0),
                        formatRupees(Number(r.retail_value ?? 0)),
                      ])}
                    />
                  </section>
                ) : null}
                {item.id === "inventory" && data.topSelling?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Top-selling products in this range</h2>
                    <DataTable
                      headers={["Product", "Unit", "Quantity sold", "Net sales"]}
                      rows={data.topSelling.map((r) => [
                        `${r.code ?? ""} · ${r.name ?? ""}`,
                        String(r.unit ?? ""),
                        `${r.quantity_sold ?? 0} ${r.unit ?? ""}`,
                        formatRupees(Number(r.net_sales ?? 0)),
                      ])}
                    />
                  </section>
                ) : null}
                {item.id === "inventory" && data.stockFlags?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Stock reconciliation flags</h2>
                    <p className="text-sm text-muted-foreground">
                      Same received less billed versus on hand rule as the existing mismatch report.
                    </p>
                    <DataTable
                      headers={[
                        "Inventory no.",
                        "Product",
                        "Received",
                        "Billed",
                        "On hand",
                        "Difference",
                      ]}
                      rows={data.stockFlags.map((r) => [
                        String(r.inventory_no ?? ""),
                        `${r.code ?? ""} · ${r.name ?? ""}`,
                        Number(r.received ?? 0),
                        Number(r.billed ?? 0),
                        Number(r.on_hand ?? 0),
                        Number(r.difference ?? 0),
                      ])}
                    />
                  </section>
                ) : null}
                {item.id === "stitching" ? <StitchingTable rows={rows} /> : null}
                {item.id === "stitching" && data.garments?.length ? (
                  <section className="space-y-3">
                    <h2 className="text-xl font-semibold">Orders by garment</h2>
                    <DataTable
                      headers={["Garment", "Received", "Pending", "Overdue", "Ready", "Delivered"]}
                      rows={data.garments.map((r) => [
                        String(r.garment ?? ""),
                        Number(r.received ?? 0),
                        Number(r.pending ?? 0),
                        Number(r.overdue ?? 0),
                        Number(r.ready ?? 0),
                        Number(r.delivered ?? 0),
                      ])}
                    />
                  </section>
                ) : null}
                {item.id !== "overview" ? (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="px-2 text-sm">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-2xl border p-10 text-center text-muted-foreground">
                No analytics available for this range.
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </main>
  );
}

function Overview({
  data,
  trend,
  setTrend,
}: {
  data: Payload;
  trend: "day" | "week" | "month";
  setTrend: (v: "day" | "week" | "month") => void;
}) {
  const s = data.summary ?? {},
    p = data.previous ?? {};
  const cards = [
    ["Net sales", s.net_sales, "Billed amount after discounts"],
    ["Money collected", s.collected, "Recorded payments received in range"],
    ["Outstanding balance", s.outstanding_balance, "Balance on eligible bills through period end"],
    ["Bills", s.bill_count, "Eligible bills in range"],
    ["Average bill", s.average_bill_value, "Net sales ÷ bills"],
    ["Unique billed customers", s.customers, "Customers with an eligible bill"],
    ["Repeat customers", s.returning_customers, "Had an eligible bill before this range"],
  ];
  const chart =
    trend === "day" ? data.trend : trend === "week" ? data.weeklyTrend : data.monthlyTrend;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, help]) => (
          <article key={String(label)} className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">
              {String(label) === "Bills" || String(label).includes("customers")
                ? Number(value ?? 0).toLocaleString()
                : formatRupees(Number(value ?? 0))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{help}</p>
          </article>
        ))}
      </div>
      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Sales billed vs money received</h2>
            <p className="text-sm text-muted-foreground">
              Sales follow bill date; collections follow payment date.
            </p>
          </div>
          <div className="flex gap-1">
            {(["day", "week", "month"] as const).map((v) => (
              <Button
                key={v}
                size="sm"
                variant={trend === v ? "default" : "outline"}
                onClick={() => setTrend(v)}
              >
                {v[0]!.toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(chart ?? []).map((row: TrendPoint) => (
            <div
              key={row.date}
              className="grid grid-cols-[6rem_1fr_auto_auto] items-center gap-2 border-b py-2 text-sm"
            >
              <span>{row.date}</span>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.min(100, (Number(row.sales) / Math.max(1, ...(chart ?? []).map((x: TrendPoint) => Number(x.sales)))) * 100)}%`,
                  }}
                />
              </div>
              <span title="Net sales billed">{formatRupees(Number(row.sales))}</span>
              <span title="Collections received" className="text-muted-foreground">
                {formatRupees(Number(row.collected))}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
          <Comparison
            label="Net sales"
            current={Number(s.net_sales ?? 0)}
            previous={Number(p.net_sales ?? 0)}
            currency
          />
          <Comparison
            label="Collections"
            current={Number(s.collected ?? 0)}
            previous={Number(p.collected ?? 0)}
            currency
          />
          <Comparison
            label="Bills"
            current={Number(s.bill_count ?? 0)}
            previous={Number(p.bill_count ?? 0)}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Bill discounts are derived from line rates less recorded line amounts. The current schema
        does not record bill returns or credit notes as separate transactions; where absent, those
        figures cannot be independently reported.
      </p>
    </>
  );
}

function Comparison({
  label,
  current,
  previous,
  currency = false,
}: {
  label: string;
  current: number;
  previous: number;
  currency?: boolean;
}) {
  const difference = current - previous;
  const change = previous === 0 ? null : (difference / Math.abs(previous)) * 100;
  const value = currency
    ? formatRupees(Math.abs(difference))
    : Math.abs(difference).toLocaleString();
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label} vs previous equivalent period</p>
      <p className="mt-1 font-medium">
        {difference > 0 ? "+" : difference < 0 ? "−" : ""}
        {value}
        {change === null ? "" : ` (${change > 0 ? "+" : ""}${change.toFixed(1)}%)`}
      </p>
    </div>
  );
}

function CustomerSummary({ data }: { data: Payload }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Billed visit days count distinct bill dates; multiple bills on one date count as one visit
        day and multiple bills. Website visits or shop footfall are not shown because reliable
        tracking is not recorded.
      </p>
      <div className="grid gap-4 xl:grid-cols-3">
        <CustomerRanking title="Top customers by spend" rows={data.topSpend ?? []} metric="spend" />
        <CustomerRanking
          title="Top customers by billed visit days"
          rows={data.topVisitDays ?? []}
          metric="visit_days"
        />
        <CustomerRanking
          title="Top customers by bills"
          rows={data.topBills ?? []}
          metric="bill_count"
        />
      </div>
    </div>
  );
}

function CustomerRanking({
  title,
  rows,
  metric,
}: {
  title: string;
  rows: AnalyticsRow[];
  metric: "spend" | "visit_days" | "bill_count";
}) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <DataTable
        headers={[
          "Customer",
          metric === "spend" ? "Spend" : metric === "visit_days" ? "Visit days" : "Bills",
        ]}
        rows={rows.map((row) => [
          <Link
            className="underline"
            to="/admin/customers/$customerId"
            params={{ customerId: row.id ?? "" }}
          >
            {row.name ?? "Unnamed customer"}
          </Link>,
          metric === "spend"
            ? formatRupees(Number(row.spend ?? 0))
            : metric === "visit_days"
              ? Number(row.visit_days ?? 0)
              : Number(row.bill_count ?? 0),
        ])}
      />
    </section>
  );
}
function SalesSummary({ data }: { data: Payload }) {
  const s = data.summary ?? {};
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Gross sales", s.grossSales],
          ["Discounts", s.discounts],
          ["Net billed sales", s.netSales],
          [
            "Net after recorded credits",
            Number(s.netSales ?? 0) - Number(s.salesReturnCredits ?? 0),
          ],
          ["Collections received", s.collections],
          ["Sales return credits", s.salesReturnCredits],
        ].map(([n, v]) => (
          <article key={String(n)} className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{n}</p>
            <p className="mt-2 text-xl font-semibold">{formatRupees(Number(v ?? 0))}</p>
          </article>
        ))}
      </div>
      <div className="rounded-2xl border p-4">
        <h2 className="font-semibold">Outstanding by age at period end</h2>
        <p className="mt-2 text-sm">
          {Object.entries(data.aging ?? {})
            .map(([k, v]) => `${k.replace("_", "–")} days: ${formatRupees(Number(v))}`)
            .join(" · ")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Collections are allocated against bills over their lifetime; the age bands use the bill
          date.
        </p>
      </div>
      <p className="text-sm text-muted-foreground">
        Cancelled bill value in the selected range, shown separately:{" "}
        {formatRupees(Number(s.cancelledBillValue ?? 0))}
      </p>
      <p className="text-xs text-muted-foreground">
        Sales return payment entries are listed separately from collections received. Cancelled bill
        value follows the existing Returns report; there is no separate credit-note ledger. Drafts
        and cancelled bills stay excluded from sales. Historical credits absent from this database
        cannot be included. Product group and code totals use bill lines; return credits cannot be
        allocated to those lines in the current schema.
      </p>
    </>
  );
}
function InventorySummary({ data }: { data: Payload }) {
  const s = data.summary ?? {};
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ["Retail stock value", formatRupees(Number(s.retailValue ?? 0))],
          ["Products in stock", s.productsInStock],
          ["Products with no sales in range", s.productsWithoutSales],
          ["Slow-moving (≤1 unit sold)", s.slowMovingProducts],
          ["Stock reconciliation flags", s.reconciliationFlags],
          ["Stock items with recorded cost", `${s.costCoveredItems ?? 0} / ${s.stockItems ?? 0}`],
        ].map(([n, v]) => (
          <article key={String(n)} className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{n}</p>
            <p className="mt-2 text-xl font-semibold">{v}</p>
          </article>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Stock quantities and retail value are a current snapshot. Sales use the selected range. Cost
        coverage counts stock records with recorded purchase cost; no margin estimate is shown
        without full cost data. No reliable receipt date or complete movement ledger is available
        for stock age.
      </p>
    </>
  );
}
function StitchingSummary({ data }: { data: Payload }) {
  const s = data.summary ?? {};
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          ["Orders received", s.received],
          ["Pending now", s.pending],
          ["Overdue now", s.overdue],
          ["Ready now", s.ready],
          ["Delivered in range", s.delivered],
          ["Legacy dated pending", s.legacyPending],
        ].map(([n, v]) => (
          <article key={String(n)} className="rounded-2xl border bg-card p-4">
            <p className="text-sm text-muted-foreground">{n}</p>
            <p className="mt-2 text-xl font-semibold">{Number(v ?? 0).toLocaleString()}</p>
          </article>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        “Legacy dated pending” is a candidate flag where order date predates its record creation
        date; legacy origin is not explicitly stored, so treat it as an indicator for review.
      </p>
    </>
  );
}

function CustomerTable({ rows }: { rows: AnalyticsRow[] }) {
  return (
    <DataTable
      headers={[
        "Customer",
        "Spend",
        "Billed visit days",
        "Bills",
        "First purchase",
        "Last purchase",
        "Avg bill",
        "Outstanding",
        "Type",
      ]}
      rows={rows.map((r) => [
        <Link
          className="underline"
          to="/admin/customers/$customerId"
          params={{ customerId: r.id ?? "" }}
        >
          {r.name ?? "Unnamed customer"}
        </Link>,
        formatRupees(Number(r.spend ?? 0)),
        r.visit_days ?? 0,
        r.bill_count ?? 0,
        r.first_purchase ?? "—",
        r.last_purchase ?? "—",
        formatRupees(Number(r.average_bill_value ?? 0)),
        formatRupees(Number(r.outstanding ?? 0)),
        r.customer_type ?? "—",
      ])}
    />
  );
}
function SalesTable({ rows }: { rows: AnalyticsRow[] }) {
  return (
    <DataTable
      headers={["Bill", "Date", "Customer", "Gross", "Discount", "Net"]}
      rows={rows.map((r) => [
        <a
          className="underline"
          href={`/admin/sales?bill=${encodeURIComponent(String(r.id ?? ""))}`}
        >
          {r.bill_no ?? ""}
        </a>,
        r.billed_on ?? "",
        <Link
          className="underline"
          to="/admin/customers/$customerId"
          params={{ customerId: r.customer_id ?? "" }}
        >
          {r.customer_name ?? "Unknown customer"}
        </Link>,
        formatRupees(Number(r.gross ?? 0)),
        formatRupees(Number(r.discount ?? 0)),
        formatRupees(Number(r.net ?? 0)),
      ])}
    />
  );
}
function InventoryTable({ rows }: { rows: AnalyticsRow[] }) {
  return (
    <DataTable
      headers={[
        "Product",
        "Group",
        "Unit",
        "Available qty",
        "Retail value",
        "Cost coverage",
        "Qty sold",
        "Net sales",
        "Slow moving",
        "No sales",
      ]}
      rows={rows.map((r) => [
        `${r.code ?? ""} · ${r.name ?? ""}`,
        r.group_name ?? "—",
        r.unit ?? "—",
        `${r.available_quantity ?? 0} ${r.unit ?? ""}`,
        formatRupees(Number(r.retail_value ?? 0)),
        `${r.cost_covered_items ?? 0}/${r.stock_items ?? 0}`,
        `${r.quantity_sold ?? 0} ${r.unit ?? ""}`,
        formatRupees(Number(r.net_sales ?? 0)),
        r.slow_moving ? "Yes (≤1 unit sold)" : "—",
        Number(r.available_quantity ?? 0) > 0 && Number(r.quantity_sold ?? 0) === 0 ? "Yes" : "—",
      ])}
    />
  );
}
function StitchingTable({ rows }: { rows: AnalyticsRow[] }) {
  return (
    <DataTable
      headers={[
        "Order",
        "Garment",
        "Customer",
        "Order date",
        "Due date",
        "Status",
        "Amount",
        "Overdue",
        "Legacy candidate",
      ]}
      rows={rows.map((r) => [
        <a
          className="underline"
          href={`/admin/stitching?order=${encodeURIComponent(String(r.id ?? ""))}`}
        >
          {r.order_no ?? ""}
        </a>,
        r.garment ?? "—",
        <Link
          className="underline"
          to="/admin/customers/$customerId"
          params={{ customerId: r.customer_id ?? "" }}
        >
          {r.customer_name ?? "Unknown customer"}
        </Link>,
        r.ordered_on ?? "",
        r.delivery_on ?? "—",
        r.status ?? "—",
        formatRupees(Number(r.amount ?? 0)),
        r.overdue ? "Yes" : "—",
        r.legacy_pending ? "Review" : "—",
      ])}
    />
  );
}
function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: (string | number | ReactNode)[][];
}) {
  const [sort, setSort] = useState<{ index: number; direction: "asc" | "desc" } | null>(null);
  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = cellSortValue(left[sort.index]);
      const rightValue = cellSortValue(right[sort.index]);
      const leftNumber = Number(leftValue.replace(/[^\d.-]/g, ""));
      const rightNumber = Number(rightValue.replace(/[^\d.-]/g, ""));
      const comparison =
        leftValue && rightValue && Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
          ? leftNumber - rightNumber
          : leftValue.localeCompare(rightValue, undefined, { numeric: true, sensitivity: "base" });
      return comparison * (sort.direction === "asc" ? 1 : -1);
    });
  }, [rows, sort]);
  return (
    <div className="overflow-x-auto rounded-2xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((x, index) => (
              <TableHead key={x} className="whitespace-nowrap">
                <button
                  type="button"
                  className="cursor-pointer hover:underline"
                  aria-sort={
                    sort?.index === index
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                  onClick={() =>
                    setSort((current) => ({
                      index,
                      direction:
                        current?.index === index && current.direction === "asc" ? "desc" : "asc",
                    }))
                  }
                >
                  {x}{" "}
                  <span aria-hidden="true">
                    {sort?.index === index ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                  </span>
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.length ? (
            sortedRows.map((row, i) => (
              <TableRow key={i}>
                {row.map((cell, j) => (
                  <TableCell key={j} className="whitespace-nowrap">
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={headers.length}
                className="h-24 text-center text-muted-foreground"
              >
                No records match this filter.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function cellSortValue(value: string | number | ReactNode) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (value && typeof value === "object" && "props" in value) {
    const props = value.props as { children?: ReactNode };
    if (typeof props.children === "string" || typeof props.children === "number")
      return String(props.children);
  }
  return "";
}

function offsetDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}
function exportValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return value as string | number;
}

function makeSheet(name: string, rows: { [key: string]: unknown }[]): ExcelSheet {
  const columns = rows.length ? Object.keys(rows[0]!) : [];
  return { name, columns, rows: rows.map((row) => columns.map((key) => exportValue(row[key]))) };
}
