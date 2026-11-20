import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { formatRupees } from "@/lib/products";
import type { ReportAnalytics } from "@/lib/report-analytics";

export function AnalyticsVisualizations({
  data,
  view,
}: {
  data: ReportAnalytics;
  view: "overview" | "products" | "customers";
}) {
  return (
    <>
      {view === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="min-w-0 rounded-xl border border-border p-3 md:p-4">
            <h3 className="font-medium">
              Sales vs collections by {data.bucket === "month" ? "month" : "day"}
            </h3>
            {data.trend.length ? (
              <ChartContainer
                className="mt-3 h-[280px] w-full aspect-auto"
                config={{
                  sales: { label: "Net sales", color: "var(--chart-1)" },
                  collected: { label: "Collected", color: "var(--chart-2)" },
                }}
              >
                <BarChart data={data.trend} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={compactRupees}
                    width={72}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(value) => formatRupees(Number(value))} />
                    }
                  />
                  <Bar dataKey="sales" fill="var(--color-sales)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} />
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
            {data.paymentMethods.length ? (
              <ChartContainer
                className="mt-3 h-[280px] w-full aspect-auto"
                config={{ collected: { label: "Collected", color: "var(--chart-3)" } }}
              >
                <BarChart data={data.paymentMethods} accessibilityLayer>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="method" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={compactRupees}
                    width={72}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent formatter={(value) => formatRupees(Number(value))} />
                    }
                  />
                  <Bar dataKey="collected" fill="var(--color-collected)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="py-12 text-sm text-muted-foreground">No payments in this range.</p>
            )}
          </div>
        </div>
      ) : null}
      {view === "products" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <TopListChart
            title="Best selling products · lifetime"
            emptyLabel="No billed products yet."
            data={data.topProducts.map((item) => ({
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
            data={data.inventoryGroups.map((item) => ({
              name: item.name,
              amount: item.retailValue,
              detail: `${item.stockedStyles} styles · ${item.quantity} units`,
            }))}
            valueLabel="Retail stock value"
            color="var(--chart-2)"
            currency
          />
        </div>
      ) : null}
      {view === "customers" ? (
        <TopListChart
          title="Highest paying customers · lifetime"
          emptyLabel="No customer payments yet."
          data={data.topCustomers.map((item) => ({
            name: item.name,
            amount: item.collected,
            detail: `${item.billCount} bills · ${formatRupees(item.netSales)} sales`,
          }))}
          valueLabel="Total paid"
          color="var(--chart-5)"
          currency
        />
      ) : null}
    </>
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
