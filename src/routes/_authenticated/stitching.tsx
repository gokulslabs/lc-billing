import { useDeferredValue, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { Customer } from "@/lib/customers";
import { formatRupees } from "@/lib/products";
import { STITCHING_STATUSES, type StitchingMeasurement, type StitchingOrder, type StitchingProduct, type StitchingStatus } from "@/lib/stitching";
import { ListFooter } from "@/components/app/ListFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/stitching")({
  head: () => ({
    meta: [
      { title: "Stitching — Ladies Collections" },
      { name: "description", content: "Tailoring orders and measurements for Ladies Collections." },
    ],
  }),
  component: StitchingPage,
});

function StitchingPage() {
  const [orderId, setOrderId] = useState<string | "new" | null>(null);
  if (orderId) return <OrderScreen id={orderId === "new" ? null : orderId} onBack={() => setOrderId(null)} onCreated={setOrderId} />;
  return <OrderList onOpen={setOrderId} />;
}

function OrderList({ onOpen }: { onOpen: (id: string | "new") => void }) {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const opening = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("board") : null;
  const [status, setStatus] = useState(opening === "ready" ? "READY" : opening === "today" ? "today" : "board");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: ["stitching-orders", deferred, status, page],
    enabled: status !== "board",
    queryFn: () => {
      const params = new URLSearchParams();
      if (deferred.trim()) params.set("q", deferred.trim());
      if (status === "soon" || status === "today" || status === "week") params.set("due", status === "soon" ? "soon" : status);
      else if (status && status !== "board") params.set("status", status);
      params.set("page", String(page));
      return apiFetch<{ orders: StitchingOrder[]; total: number }>(`/api/stitching-orders?${params.toString()}`);
    },
  });
  const rows = orders.data?.orders ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Stitching</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {status === "board"
              ? "Due today, this week, and ready for pickup."
              : "An order is a customer, a garment, a bag number, and measurements."}
          </p>
        </div>
        <Button className="rounded-full" onClick={() => onOpen("new")}>
          New order
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Order, bag or customer"
          className="w-64"
        />
        <Select
          value={status || "all"}
          onValueChange={(value) => {
            setStatus(value === "all" ? "" : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Due soon" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="board">Board</SelectItem>
            <SelectItem value="today">Due today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="soon">Due soon</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {STITCHING_STATUSES.map((item) => (
              <SelectItem key={item} value={item}>
                {item === "PENDING" ? "All pending" : item === "TRIAL" ? "Trial" : item === "READY" ? "Ready" : item === "DELIVERED" ? "Delivered" : item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {orders.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {orders.error instanceof Error ? <p className="text-sm text-destructive">{orders.error.message}</p> : null}
      {status === "board" ? <StitchingBoard onOpen={onOpen} /> : null}
      {status !== "board" && !orders.isLoading && rows.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : null}
      {status === "board" ? null : <ListFooter page={page} total={orders.data?.total ?? 0} shown={rows.length} onPage={setPage} />}
      {status !== "board" && rows.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Bag</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Garment</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium">{order.orderNo}</TableCell>
                  <TableCell>{order.bagNo || "—"}</TableCell>
                  <TableCell>{order.customerName}</TableCell>
                  <TableCell>{order.productName}</TableCell>
                  <TableCell>{order.orderedOn}</TableCell>
                  <TableCell>{order.deliveryOn || "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <span className="mr-1">{order.status}</span>
                      {STITCHING_STATUSES.filter((item) => item !== "PENDING" && item !== order.status).map((item) => (
                        <Button
                          key={item}
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => {
                            void apiFetch(`/api/stitching-orders/${order.id}/status`, {
                              method: "PATCH",
                              body: JSON.stringify({ status: item }),
                            })
                              .then(() => {
                                toast.success(`Order ${order.orderNo} is ${item.toLowerCase()}.`);
                                void queryClient.invalidateQueries({ queryKey: ["stitching-orders"] });
                              })
                              .catch((reason: Error) => toast.error(reason.message));
                          }}
                        >
                          {item === "TRIAL" ? "Trial" : item === "READY" ? "Ready" : "Delivered"}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{formatRupees(order.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => onOpen(order.id)}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function StitchingBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const queryClient = useQueryClient();
  const today = useQuery({
    queryKey: ["stitching-board", "today"],
    queryFn: () => apiFetch<{ orders: StitchingOrder[] }>("/api/stitching-orders?due=today&page=1"),
  });
  const week = useQuery({
    queryKey: ["stitching-board", "week"],
    queryFn: () => apiFetch<{ orders: StitchingOrder[] }>("/api/stitching-orders?due=week&page=1"),
  });
  const ready = useQuery({
    queryKey: ["stitching-board", "ready"],
    queryFn: () => apiFetch<{ orders: StitchingOrder[] }>("/api/stitching-orders?status=READY&page=1"),
  });
  const columns = [
    ["Due today", today],
    ["This week", week],
    ["Ready for pickup", ready],
  ] as const;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {columns.map(([title, query]) => (
        <section key={title} className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          {query.isLoading ? <p className="mt-3 text-sm text-muted-foreground">Loading…</p> : null}
          {query.error instanceof Error ? <p className="mt-3 text-sm text-destructive">{query.error.message}</p> : null}
          <div className="mt-3 space-y-3">
            {(query.data?.orders ?? []).map((order) => (
              <article key={order.id} className="rounded-xl border border-border px-3 py-3">
                <button type="button" className="block w-full text-left" onClick={() => onOpen(order.id)}>
                  <p className="font-medium">{order.customerName || "No name"}</p>
                  <p className="text-sm text-muted-foreground">
                    {order.productName} · bag {order.bagNo || "—"} · {order.deliveryOn || "no date"} · {order.status}
                  </p>
                </button>
                <div className="mt-2 flex flex-wrap gap-1">
                  {STITCHING_STATUSES.filter((item) => item !== "PENDING" && item !== order.status).map((item) => (
                    <Button
                      key={item}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        void apiFetch(`/api/stitching-orders/${order.id}/status`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: item }),
                        })
                          .then(() => {
                            toast.success(`${order.customerName || "Order"} is ${item.toLowerCase()}.`);
                            void queryClient.invalidateQueries({ queryKey: ["stitching-board"] });
                            void queryClient.invalidateQueries({ queryKey: ["stitching-orders"] });
                          })
                          .catch((reason: Error) => toast.error(reason.message));
                      }}
                    >
                      {item === "TRIAL" ? "Trial" : item === "READY" ? "Ready" : "Delivered"}
                    </Button>
                  ))}
                </div>
              </article>
            ))}
            {!query.isLoading && (query.data?.orders.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">None.</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function OrderScreen({ id, onBack, onCreated }: { id: string | null; onBack: () => void; onCreated: (id: string) => void }) {
  const queryClient = useQueryClient();
  const products = useQuery({
    queryKey: ["stitching-products"],
    queryFn: () => apiFetch<{ products: StitchingProduct[] }>("/api/stitching-orders/products"),
  });
  const existing = useQuery({
    queryKey: ["stitching-order", id],
    enabled: Boolean(id),
    queryFn: () => apiFetch<{ order: StitchingOrder }>(`/api/stitching-orders/${id}`),
  });
  const order = existing.data?.order;
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [productId, setProductId] = useState("");
  const [bagNo, setBagNo] = useState("");
  const [orderedOn, setOrderedOn] = useState(localToday());
  const [deliveryOn, setDeliveryOn] = useState("");
  const [status, setStatus] = useState<StitchingStatus>("PENDING");
  const [amount, setAmount] = useState("0");
  const [measurements, setMeasurements] = useState<StitchingMeasurement[]>([{ label: "", value: "" }]);
  const [seen, setSeen] = useState<string | null>(null);
  const mode = id ?? "new";
  if (order && seen !== order.id) {
    setSeen(order.id);
    setCustomerId(order.customerId);
    setCustomerName(order.customerName);
    setProductId(order.productId);
    setBagNo(order.bagNo ?? "");
    setOrderedOn(order.orderedOn);
    setDeliveryOn(order.deliveryOn ?? "");
    setStatus(order.status);
    setAmount(String(order.amount));
    setMeasurements(order.measurements.length ? order.measurements : [{ label: "", value: "" }]);
  }
  const customers = useQuery({
    queryKey: ["customers", "stitching", customerQuery],
    enabled: !id,
    queryFn: () => {
      const params = new URLSearchParams();
      if (customerQuery.trim()) params.set("q", customerQuery.trim());
      const suffix = params.size ? `?${params.toString()}` : "";
      return apiFetch<{ customers: Customer[] }>(`/api/customers${suffix}`);
    },
  });

  const save = useMutation({
    mutationFn: () => {
      const value = Number(amount);
      if (!customerId) throw new Error("Choose a customer.");
      if (!Number.isFinite(value)) throw new Error("Enter an amount.");
      const body = JSON.stringify({
        customerId,
        productId,
        bagNo,
        orderedOn,
        deliveryOn,
        status,
        amount: value,
        measurements,
      });
      if (id) return apiFetch<{ order: StitchingOrder }>(`/api/stitching-orders/${id}`, { method: "PATCH", body });
      return apiFetch<{ order: StitchingOrder }>("/api/stitching-orders", { method: "POST", body });
    },
    onSuccess: (result) => {
      toast.success(id ? "Order updated." : "Order added.");
      void queryClient.invalidateQueries({ queryKey: ["stitching-orders"] });
      void queryClient.invalidateQueries({ queryKey: ["stitching-order", result.order.id] });
      if (!id) onCreated(result.order.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/stitching-orders/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Order removed.");
      void queryClient.invalidateQueries({ queryKey: ["stitching-orders"] });
      onBack();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function chooseProduct(nextId: string) {
    setProductId(nextId);
    const product = products.data?.products.find((item) => item.id === nextId);
    setMeasurements((current) => {
      if (current.some((row) => row.label.trim() || row.value.trim())) return current;
      if (!product?.measurements.length) return [{ label: "", value: "" }];
      return product.measurements.map((field) => ({ label: field.label, value: "" }));
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-10">
      <div>
        <Button variant="outline" className="rounded-full" onClick={onBack}>
          Back
        </Button>
        <h1 className="mt-4 text-4xl font-semibold">{order ? `Order ${order.orderNo}` : "New order"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Measurements stay as written, including values such as 36+4.</p>
      </div>
      {existing.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        {id ? (
          <p className="text-sm">{customerName}</p>
        ) : (
          <>
            <Field label="Find customer" id="stitch-customer-search">
              <Input
                id="stitch-customer-search"
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Name, phone or book no."
              />
            </Field>
            <div className="max-h-40 space-y-1 overflow-auto">
              {(customers.data?.customers ?? []).map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${customerId === customer.id ? "bg-accent" : "hover:bg-muted"}`}
                  onClick={() => {
                    setCustomerId(customer.id);
                    setCustomerName(customer.name);
                  }}
                >
                  {customer.name}
                  {customer.phone ? ` · ${customer.phone}` : ""}
                </button>
              ))}
            </div>
          </>
        )}
        <Field label="Garment" id="stitch-product">
          <Select value={productId || undefined} onValueChange={chooseProduct}>
            <SelectTrigger id="stitch-product">
              <SelectValue placeholder="Choose" />
            </SelectTrigger>
            <SelectContent>
              {(products.data?.products ?? []).map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bag no." id="stitch-bag">
            <Input id="stitch-bag" value={bagNo} onChange={(event) => setBagNo(event.target.value)} maxLength={40} />
          </Field>
          <Field label="Amount" id="stitch-amount">
            <Input id="stitch-amount" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </Field>
          <Field label="Date" id="stitch-date">
            <Input id="stitch-date" type="date" value={orderedOn} onChange={(event) => setOrderedOn(event.target.value)} required />
          </Field>
          <Field label="Delivery" id="stitch-delivery">
            <Input id="stitch-delivery" type="date" value={deliveryOn} onChange={(event) => setDeliveryOn(event.target.value)} />
          </Field>
        </div>
        <Field label="Status" id="stitch-status">
          <Select value={status} onValueChange={(value) => setStatus(value as StitchingStatus)}>
            <SelectTrigger id="stitch-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STITCHING_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Measurements</h2>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => setMeasurements((current) => [...current, { label: "", value: "" }])}
            >
              Add row
            </Button>
          </div>
          {measurements.map((row, index) => (
            <div key={index} className="grid grid-cols-2 gap-3">
              <Input
                aria-label={`Measurement ${index + 1} name`}
                value={row.label}
                placeholder="FRONT NECK"
                maxLength={40}
                onChange={(event) => updateRow(setMeasurements, index, { label: event.target.value })}
              />
              <Input
                aria-label={`Measurement ${index + 1} value`}
                value={row.value}
                placeholder="36+4"
                maxLength={40}
                onChange={(event) => updateRow(setMeasurements, index, { value: event.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" className="rounded-full" disabled={save.isPending}>
            {save.isPending ? "Saving…" : id ? "Save" : "Add order"}
          </Button>
          {id ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={remove.isPending}
              onClick={() => {
                if (!window.confirm(`Remove order ${order?.orderNo ?? ""}?`)) return;
                remove.mutate();
              }}
            >
              Remove
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function updateRow(
  setRows: (update: (current: StitchingMeasurement[]) => StitchingMeasurement[]) => void,
  index: number,
  patch: Partial<StitchingMeasurement>,
) {
  setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
}

function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
