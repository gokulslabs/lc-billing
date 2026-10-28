import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { CustomerHistory } from "@/lib/customers";
import { formatRupees } from "@/lib/products";
import { billStatusLabel } from "@/lib/sales";
import { ListFooter } from "@/components/app/ListFooter";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  head: () => ({
    meta: [
      { title: "Customer — Ladies Collections" },
      { name: "description", content: "Bills, payments and stitching for one customer." },
    ],
  }),
  component: CustomerHistoryPage,
});

function CustomerHistoryPage() {
  const { customerId } = Route.useParams();
  const [billPage, setBillPage] = useState(1);
  const [orderPage, setOrderPage] = useState(1);
  const history = useQuery({
    queryKey: ["customer-history", customerId, billPage, orderPage],
    queryFn: () =>
      apiFetch<CustomerHistory>(`/api/customers/${customerId}/history?billsPage=${billPage}&ordersPage=${orderPage}`),
  });
  const data = history.data;
  const customer = data?.customer;

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div>
        <Button variant="outline" className="mb-4 rounded-full" asChild>
          <Link to="/customers">Customers</Link>
        </Button>
        <h1 className="text-4xl font-semibold">{customer?.name ?? "Customer"}</h1>
        {customer ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {[customer.phone, customer.bookNo ? `Book ${customer.bookNo}` : "", customer.address].filter(Boolean).join(" · ") ||
              "No phone or address"}
          </p>
        ) : null}
      </div>
      {history.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {history.error instanceof Error ? <p className="text-sm text-destructive">{history.error.message}</p> : null}
      {data ? (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Summary label="Bills" value={String(data.billTotal)} />
            <Summary label="Billed" value={formatRupees(data.billed)} />
            <Summary label="Collected" value={formatRupees(data.collected)} />
            <Summary label="Stitching" value={String(data.orderTotal)} />
          </div>
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Bills</h2>
            {data.bills.length === 0 ? <p className="text-sm text-muted-foreground">No bills yet.</p> : null}
            {data.bills.map((bill) => (
              <article key={bill.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="font-medium">
                    {bill.billNo} · {bill.billedOn}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatRupees(bill.total)} · collected {formatRupees(bill.collected)} · balance {formatRupees(bill.balance)} ·{" "}
                    <span>{billStatusLabel(bill.status)}</span>
                  </p>
                </div>
                {bill.lines.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Inventory no.</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bill.lines.map((line, index) => (
                        <TableRow key={`${line.inventoryNo}-${index}`}>
                          <TableCell className="whitespace-nowrap font-mono text-sm">{line.inventoryNo}</TableCell>
                          <TableCell>{line.productName || "—"}</TableCell>
                          <TableCell>{formatQty(line.quantity)}</TableCell>
                          <TableCell>{formatRupees(line.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No lines on this bill.</p>
                )}
                {bill.payments.map((payment, index) => (
                  <p key={`${payment.paidOn}-${index}`} className="mt-2 text-sm text-muted-foreground">
                    Paid {payment.paidOn} · {payment.mode ?? "Not recorded"} · {formatRupees(payment.amount)}
                  </p>
                ))}
              </article>
            ))}
            <ListFooter page={billPage} total={data.billTotal} shown={data.bills.length} onPage={setBillPage} />
          </section>
          <section className="space-y-4">
            <h2 className="text-2xl font-semibold">Stitching</h2>
            {data.orders.length === 0 ? <p className="text-sm text-muted-foreground">No stitching orders yet.</p> : null}
            {data.orders.length > 0 ? (
              <div className="rounded-2xl border border-border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Bag</TableHead>
                      <TableHead>Garment</TableHead>
                      <TableHead>Ordered</TableHead>
                      <TableHead>Delivery</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.orders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.orderNo}</TableCell>
                        <TableCell>{order.bagNo || "—"}</TableCell>
                        <TableCell>{order.garment || "—"}</TableCell>
                        <TableCell>{order.orderedOn}</TableCell>
                        <TableCell>{order.deliveryOn || "—"}</TableCell>
                        <TableCell>{order.status}</TableCell>
                        <TableCell>{formatRupees(order.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
            <ListFooter page={orderPage} total={data.orderTotal} shown={data.orders.length} onPage={setOrderPage} />
          </section>
        </>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function formatQty(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
}
