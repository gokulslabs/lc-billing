import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { isUnrecordedName, type CustomerHistory } from "@/lib/customers";
import { formatRupees } from "@/lib/products";
import { billStatusLabel } from "@/lib/sales";
import { ListFooter } from "@/components/app/ListFooter";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
import { DeskTable, PhoneCard, PhoneCards } from "@/components/app/PhoneList";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/customers/$customerId")({
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
  const startBill = useMutation({
    mutationFn: () =>
      apiFetch<{ invoice: { id: string } }>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({ customerId }),
      }),
    onSuccess: (result) => {
      window.location.assign(`/admin/sales?bill=${result.invoice.id}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="mx-auto max-w-[100rem] space-y-8 p-4 md:p-10">
      <div>
        <Button variant="outline" className="mb-4 rounded-full" asChild>
          <Link to="/admin/customers">Customers</Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold md:text-4xl">{customer?.name ?? "Customer"}</h1>
          {customer && !isUnrecordedName(customer.name) ? (
            <Button className="rounded-full" disabled={startBill.isPending} onClick={() => startBill.mutate()}>
              {startBill.isPending ? "Opening…" : "New bill"}
            </Button>
          ) : null}
          {customer ? (
            <ExportExcelButton
              filename="customer-history"
              load={async () => {
                const full = await apiFetch<CustomerHistory>(`/api/customers/${customer.id}/history?export=1`);
                return [
                  {
                    name: "Bills",
                    columns: ["Bill no.", "Date", "Net", "Collected", "Balance", "Status"],
                    rows: full.bills.map((bill) => [bill.billNo, bill.billedOn, bill.total, bill.collected, bill.balance, billStatusLabel(bill.status)]),
                  },
                  {
                    name: "Bill lines",
                    columns: ["Bill no.", "Date", "Inventory no.", "Product", "Qty", "Amount"],
                    rows: full.bills.flatMap((bill) =>
                      bill.lines.map((line) => [bill.billNo, bill.billedOn, line.inventoryNo, line.productName, line.quantity, line.amount]),
                    ),
                  },
                  {
                    name: "Orders",
                    columns: ["Order", "Bag", "Garment", "Ordered", "Delivery", "Status", "Amount"],
                    rows: full.orders.map((order) => [order.orderNo, order.bagNo ?? "", order.garment, order.orderedOn, order.deliveryOn ?? "", order.status, order.amount]),
                  },
                ];
              }}
            />
          ) : null}
        </div>
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
                    <a href={`/admin/sales?bill=${bill.id}`} className="hover:underline">
                      {bill.billNo}
                    </a>{" "}
                    · {bill.billedOn}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatRupees(bill.total)} · collected {formatRupees(bill.collected)} · balance {formatRupees(bill.balance)} ·{" "}
                    <span>{billStatusLabel(bill.status)}</span>
                  </p>
                </div>
                {bill.lines.length > 0 ? (
                  <>
                  <PhoneCards>
                    {bill.lines.map((line, index) => (
                      <PhoneCard
                        key={`${line.inventoryNo}-${index}`}
                        title={line.productName || line.inventoryNo}
                        detail={`${line.inventoryNo} · qty ${formatQty(line.quantity)} · ${formatRupees(line.amount)}`}
                      />
                    ))}
                  </PhoneCards>
                  <DeskTable>
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
                  </DeskTable>
                  </>
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
              <>
              <PhoneCards>
                {data.orders.map((order) => (
                  <PhoneCard
                    key={order.id}
                    title={`${order.orderNo} · ${order.garment || "Order"}`}
                    detail={`Bag ${order.bagNo || "—"} · ordered ${order.orderedOn} · delivery ${order.deliveryOn || "—"} · ${order.status} · ${formatRupees(order.amount)}`}
                  />
                ))}
              </PhoneCards>
              <DeskTable>
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
              </DeskTable>
              </>
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
