import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LineChart,
  Line,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatRupees } from "@/lib/products";

type TrendPoint = { date: string; sales: number; collected: number };
type RankPoint = { label: string; value: number; detail?: string };
type PaymentPoint = { method: string; amount: number };
type UnitGroupPoint = {
  group_name: string;
  unit: string;
  available_quantity: number;
  retail_value: number;
};
type StockTopPoint = {
  code: string;
  name: string;
  net_sales: number;
  quantity_sold: number;
  unit: string;
};
type StitchingPoint = {
  garment: string;
  pending: number;
  overdue: number;
  ready: number;
  delivered: number;
  received: number;
};

export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) return <ChartEmpty text="No sales or collections in this range." />;
  return (
    <ChartContainer
      className="h-[280px] w-full aspect-auto"
      config={{
        sales: { label: "Net billed sales", color: "var(--chart-1)" },
        collected: { label: "Money received", color: "var(--chart-2)" },
      }}
    >
      <LineChart data={data} accessibilityLayer margin={{ left: 8, right: 12, top: 10 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={compactRupees} width={68} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelKey="date"
              formatter={(value) => formatRupees(Number(value))}
            />
          }
        />
        <Line
          dataKey="sales"
          type="monotone"
          stroke="var(--color-sales)"
          strokeWidth={2.5}
          dot={false}
        />
        <Line
          dataKey="collected"
          type="monotone"
          stroke="var(--color-collected)"
          strokeWidth={2.5}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}

export function RankingChart({
  title,
  data,
  currency = false,
  color = "var(--chart-4)",
  empty = "No records in this range.",
}: {
  title: string;
  data: RankPoint[];
  currency?: boolean;
  color?: string;
  empty?: string;
}) {
  if (!data.length) return <ChartEmpty text={empty} />;
  return (
    <ChartPanel title={title}>
      <ChartContainer
        className="h-[300px] w-full aspect-auto"
        config={{ value: { label: currency ? "Amount" : "Count", color } }}
      >
        <BarChart data={data} layout="vertical" accessibilityLayer margin={{ left: 4, right: 16 }}>
          <CartesianGrid horizontal={false} />
          <XAxis
            type="number"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              currency ? compactRupees(Number(value)) : Number(value).toLocaleString("en-IN")
            }
          />
          <YAxis
            type="category"
            dataKey="label"
            width={126}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) =>
              value.length > 18 ? `${value.slice(0, 17)}…` : value
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelKey="label"
                formatter={(value) =>
                  currency ? formatRupees(Number(value)) : Number(value).toLocaleString("en-IN")
                }
              />
            }
          />
          <Bar dataKey="value" fill="var(--color-value)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartContainer>
    </ChartPanel>
  );
}

export function PaymentMixChart({ data }: { data: PaymentPoint[] }) {
  if (!data.length) return <ChartEmpty text="No collections in this range." />;
  const colors = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ];
  return (
    <ChartPanel title="Collections received by payment method">
      <ChartContainer
        className="h-[280px] w-full aspect-auto"
        config={{ amount: { label: "Collected", color: "var(--chart-3)" } }}
      >
        <PieChart accessibilityLayer>
          <ChartTooltip
            content={<ChartTooltipContent formatter={(value) => formatRupees(Number(value))} />}
          />
          <Pie
            data={data}
            dataKey="amount"
            nameKey="method"
            innerRadius={58}
            outerRadius={96}
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell key={entry.method} fill={colors[index % colors.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {data.map((entry, index) => (
          <p key={entry.method} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[index % colors.length] }}
            />
            <span className="truncate">{entry.method}</span>
            <span className="ml-auto font-medium">{formatRupees(entry.amount)}</span>
          </p>
        ))}
      </div>
    </ChartPanel>
  );
}

export function AgingChart({ data }: { data: Record<string, number | string> }) {
  const labels: Record<string, string> = {
    "0_30": "0–30 days",
    "31_60": "31–60 days",
    "61_90": "61–90 days",
    over_90: "Over 90 days",
  };
  const rows = Object.entries(data).map(([key, value]) => ({
    label: labels[key] ?? key,
    value: Number(value),
  }));
  return (
    <RankingChart
      title="Outstanding balance by age"
      data={rows}
      currency
      color="var(--chart-5)"
      empty="No outstanding balances."
    />
  );
}

export function InventoryGroupChart({ data }: { data: UnitGroupPoint[] }) {
  if (!data.length) return <ChartEmpty text="No inventory groups in the catalogue." />;
  const rows = data.slice(0, 10).map((row) => ({
    label: `${row.group_name} (${row.unit === "MT" ? "metres" : "pieces"})`,
    value: Number(row.retail_value),
    detail: `${Number(row.available_quantity).toLocaleString("en-IN")} ${row.unit === "MT" ? "m" : "pcs"}`,
  }));
  return (
    <RankingChart
      title="Top groups by current retail stock value and unit"
      data={rows}
      currency
      color="var(--chart-2)"
    />
  );
}

export function TopSellingChart({
  data,
  metric = "sales",
}: {
  data: StockTopPoint[];
  metric?: "sales" | "quantity";
}) {
  const rows = data.slice(0, 10).map((row) => ({
    label: `${row.code} · ${row.name}`,
    value: metric === "sales" ? Number(row.net_sales) : Number(row.quantity_sold),
    detail: `${row.quantity_sold} ${row.unit === "MT" ? "m" : "pcs"}`,
  }));
  return (
    <RankingChart
      title={
        metric === "sales" ? "Top products by net billed sales" : "Top products by quantity sold"
      }
      data={rows}
      currency={metric === "sales"}
      color="var(--chart-4)"
      empty="No product sales in this range."
    />
  );
}

export function StitchingChart({ data }: { data: StitchingPoint[] }) {
  if (!data.length) return <ChartEmpty text="No stitching orders in this period." />;
  return (
    <ChartPanel title="Stitching workload by garment">
      <ChartContainer
        className="h-[320px] w-full aspect-auto"
        config={{
          pending: { label: "Pending total", color: "var(--chart-1)" },
          overdue: { label: "Overdue subset", color: "var(--chart-5)" },
          ready: { label: "Ready", color: "var(--chart-3)" },
          delivered: { label: "Delivered", color: "var(--chart-2)" },
        }}
      >
        <ComposedChart data={data} accessibilityLayer margin={{ left: 4, right: 12, top: 10 }}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="garment"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value: string) =>
              value.length > 14 ? `${value.slice(0, 13)}…` : value
            }
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="pending" fill="var(--color-pending)" />
          <Bar dataKey="ready" fill="var(--color-ready)" />
          <Bar dataKey="delivered" fill="var(--color-delivered)" radius={[4, 4, 0, 0]} />
          <Line dataKey="overdue" type="monotone" stroke="var(--color-overdue)" strokeWidth={3} />
        </ComposedChart>
      </ChartContainer>
      <p className="mt-2 text-xs text-muted-foreground">
        Received and delivered counts use the selected range; current pending, overdue, and ready
        orders are shown as a workload snapshot.
      </p>
    </ChartPanel>
  );
}

function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ChartEmpty({ text }: { text: string }) {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed px-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function compactRupees(value: number) {
  if (Math.abs(value) >= 1_000_000) return `₹${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `₹${(value / 1_000).toFixed(0)}k`;
  return `₹${value}`;
}
