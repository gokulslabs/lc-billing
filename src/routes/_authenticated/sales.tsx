import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { Customer } from "@/lib/customers";
import { formatRupees } from "@/lib/products";
import { monthStart } from "@/lib/reports";
import type { InvoiceDetail, InvoiceItem, InvoiceSummary } from "@/lib/sales";
import { shopToday } from "@/lib/sales";
import { ListFooter } from "@/components/app/ListFooter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/sales")({
  head: () => ({
    meta: [
      { title: "Sales & billing — Ladies Collections" },
      { name: "description", content: "Bills, line items and collections for Ladies Collections." },
    ],
  }),
  component: SalesPage,
});

function SalesPage() {
  const [billId, setBillId] = useState<string | null>(null);
  if (billId) return <BillScreen id={billId} onBack={() => setBillId(null)} />;
  return <SalesHome onOpen={setBillId} />;
}

function SalesHome({ onOpen }: { onOpen: (id: string) => void }) {
  const today = shopToday();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const [from, setFrom] = useState(monthStart(today));
  const [to, setTo] = useState(today);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const bills = useQuery({
    queryKey: ["invoices", deferred, from, to, page],
    queryFn: () =>
      apiFetch<{ invoices: InvoiceSummary[]; total: number }>(`/api/invoices${query({ q: deferred, from, to, page })}`),
  });
  const items = useQuery({
    queryKey: ["invoice-items", deferred, from, to, page],
    queryFn: () => apiFetch<{ items: InvoiceItem[]; total: number }>(`/api/invoices/items${query({ q: deferred, from, to, page })}`),
  });
  const rows = bills.data?.invoices ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Sales & billing</h1>
          <p className="mt-2 text-sm text-muted-foreground">A bill is a customer, then lines added by inventory number.</p>
        </div>
        <Button className="rounded-full" onClick={() => setCreating(true)}>
          New bill
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Bill no. or customer"
          className="w-56"
        />
        <Input
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            setPage(1);
          }}
          aria-label="From date"
          className="w-40"
        />
        <Input
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            setPage(1);
          }}
          aria-label="To date"
          className="w-40"
        />
      </div>
      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
        </TabsList>
        <TabsContent value="bills" className="space-y-4">
          {bills.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {bills.error instanceof Error ? <p className="text-sm text-destructive">{bills.error.message}</p> : null}
          {!bills.isLoading && rows.length === 0 ? <p className="text-sm text-muted-foreground">No bills yet.</p> : null}
          {rows.length > 0 ? (
            <div className="rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill no.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">{bill.billNo}</TableCell>
                      <TableCell>{bill.billedOn}</TableCell>
                      <TableCell>
                        <Link to="/customers/$customerId" params={{ customerId: bill.customerId }} className="hover:underline">
                          {bill.customerName}
                        </Link>
                      </TableCell>
                      <TableCell>{formatRupees(bill.total)}</TableCell>
                      <TableCell>{formatRupees(bill.collected)}</TableCell>
                      <TableCell>{formatRupees(bill.balance)}</TableCell>
                      <TableCell className="capitalize">{bill.status}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="sm" className="rounded-full" onClick={() => onOpen(bill.id)}>
                          Open
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          <ListFooter page={page} total={bills.data?.total ?? 0} shown={rows.length} onPage={setPage} />
        </TabsContent>
        <TabsContent value="items" className="space-y-4">
          {items.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {items.error instanceof Error ? <p className="text-sm text-destructive">{items.error.message}</p> : null}
          {(items.data?.items.length ?? 0) === 0 && !items.isLoading ? (
            <p className="text-sm text-muted-foreground">No bill lines yet.</p>
          ) : null}
          {(items.data?.items.length ?? 0) > 0 ? (
            <div className="rounded-2xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill no.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Inventory no.</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(items.data?.items ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.billNo}</TableCell>
                      <TableCell>{item.billedOn}</TableCell>
                      <TableCell>{item.customerName}</TableCell>
                      <TableCell>{item.inventoryNo}</TableCell>
                      <TableCell>
                        {item.productCode} · {item.productName}
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{formatRupees(item.rate)}</TableCell>
                      <TableCell>{formatRupees(item.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
          {(items.data?.items.length ?? 0) > 0 ? (
            <p className="text-sm text-muted-foreground">Lines from the bills on this page.</p>
          ) : null}
        </TabsContent>
      </Tabs>
      <NewBillDialog open={creating} onOpenChange={setCreating} onCreated={onOpen} />
    </div>
  );
}

function BillScreen({ id, onBack }: { id: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const bill = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => apiFetch<{ invoice: InvoiceDetail }>(`/api/invoices/${id}`),
  });
  const invoice = bill.data?.invoice;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
    void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    void queryClient.invalidateQueries({ queryKey: ["invoice-items"] });
    void queryClient.invalidateQueries({ queryKey: ["inventory"] });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Button variant="outline" className="rounded-full" onClick={onBack}>
            Back
          </Button>
          <h1 className="mt-4 text-4xl font-semibold">{invoice ? `Bill ${invoice.billNo}` : "Bill"}</h1>
          {invoice ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <Link to="/customers/$customerId" params={{ customerId: invoice.customerId }} className="hover:underline">
                {invoice.customerName}
              </Link>{" "}
              · {invoice.billedOn} · <span className="capitalize">{invoice.status}</span>
            </p>
          ) : null}
        </div>
        {invoice ? <p className="font-display text-3xl font-semibold">{formatRupees(invoice.total)}</p> : null}
      </div>
      {bill.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {bill.error instanceof Error ? <p className="text-sm text-destructive">{bill.error.message}</p> : null}
      {invoice?.remarks ? <p className="text-sm text-muted-foreground">Reason: {invoice.remarks}</p> : null}
      {invoice && invoice.status === "open" ? <LineForm invoiceId={invoice.id} onSaved={refresh} /> : null}
      {invoice ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inventory no.</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground">
                    No lines yet.
                  </TableCell>
                </TableRow>
              ) : null}
              {invoice.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">{line.inventoryNo}</TableCell>
                  <TableCell>{line.productCode}</TableCell>
                  <TableCell>{line.groupName}</TableCell>
                  <TableCell>{line.productName}</TableCell>
                  <TableCell>{line.quantity}</TableCell>
                  <TableCell>{formatRupees(line.rate)}</TableCell>
                  <TableCell className="capitalize">{line.status}</TableCell>
                  <TableCell>{formatRupees(line.amount)}</TableCell>
                  <TableCell className="text-right">
                    {invoice.status === "open" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          void apiFetch(`/api/invoices/${invoice.id}/lines/${line.id}`, { method: "DELETE" })
                            .then(refresh)
                            .catch((reason: Error) => toast.error(reason.message));
                        }}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {invoice ? (
        <div className="grid gap-6 md:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Collection</h2>
            <p className="text-sm text-muted-foreground">Balance {formatRupees(invoice.balance)}</p>
            {invoice.payments.map((payment) => (
              <p key={payment.id} className="text-sm">
                {payment.paidOn} · {formatRupees(payment.amount)}
                {payment.showroom ? ` · ${payment.showroom}` : ""}
              </p>
            ))}
            {invoice.payments.length === 0 ? <p className="text-sm text-muted-foreground">No collection yet.</p> : null}
            {invoice.status === "open" && invoice.balance > 0 ? (
              <CollectForm invoiceId={invoice.id} onSaved={refresh} />
            ) : null}
          </section>
          {invoice.status === "open" ? <CancelForm invoice={invoice} onSaved={refresh} onRemoved={onBack} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function LineForm({ invoiceId, onSaved }: { invoiceId: string; onSaved: () => void }) {
  const [inventoryNo, setInventoryNo] = useState("");
  const [lookup, setLookup] = useState("");
  const [quantity, setQuantity] = useState("1");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handle = window.setTimeout(() => setLookup(inventoryNo.trim()), 300);
    return () => window.clearTimeout(handle);
  }, [inventoryNo]);
  const preview = useQuery({
    queryKey: ["invoice-preview", lookup],
    enabled: lookup.length > 0,
    queryFn: () =>
      apiFetch<{
        preview: { productCode: string; groupName: string; productName: string; rate: number; status: string; available: number };
      }>(`/api/invoices/preview?inventoryNo=${encodeURIComponent(lookup)}`),
    retry: false,
  });
  const add = useMutation({
    mutationFn: () => {
      const amount = Number(quantity);
      if (!Number.isFinite(amount)) throw new Error("Enter a quantity.");
      return apiFetch(`/api/invoices/${invoiceId}/lines`, {
        method: "POST",
        body: JSON.stringify({ inventoryNo, quantity: amount }),
      });
    },
    onSuccess: () => {
      setInventoryNo("");
      setLookup("");
      setQuantity("1");
      toast.success("Line added.");
      onSaved();
      inputRef.current?.focus();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        add.mutate();
      }}
    >
      <Field label="Inventory no." id="line-no">
        <Input
          ref={inputRef}
          id="line-no"
          value={inventoryNo}
          onChange={(event) => setInventoryNo(event.target.value)}
          autoFocus
          autoComplete="off"
          className="w-44 font-mono"
          required
        />
      </Field>
      <Field label="Quantity" id="line-qty">
        <Input id="line-qty" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-28" required />
      </Field>
      <Button type="submit" className="rounded-full" disabled={add.isPending}>
        {add.isPending ? "Adding…" : "Add"}
      </Button>
      {preview.data ? (
        <p className="pb-2 text-sm text-muted-foreground">
          {preview.data.preview.productCode} · {preview.data.preview.groupName} · {preview.data.preview.productName} ·{" "}
          {formatRupees(preview.data.preview.rate)} · {preview.data.preview.status} · {preview.data.preview.available} left
        </p>
      ) : null}
      {preview.error instanceof Error && lookup === inventoryNo.trim() ? (
        <p className="pb-2 text-sm text-destructive">{preview.error.message}</p>
      ) : null}
    </form>
  );
}

function CollectForm({ invoiceId, onSaved }: { invoiceId: string; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(localToday());
  const [showroom, setShowroom] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const value = Number(amount);
      if (!Number.isFinite(value)) throw new Error("Enter an amount.");
      return apiFetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: value, paidOn, showroom }),
      });
    },
    onSuccess: () => {
      setAmount("");
      toast.success("Collection saved.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <Field label="Amount" id="collect-amount">
        <Input id="collect-amount" value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </Field>
      <Field label="Date" id="collect-date">
        <Input id="collect-date" type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} required />
      </Field>
      <Field label="Showroom" id="collect-showroom">
        <Input id="collect-showroom" value={showroom} onChange={(event) => setShowroom(event.target.value)} maxLength={80} />
      </Field>
      <Button type="submit" className="rounded-full" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Collect"}
      </Button>
    </form>
  );
}

function CancelForm({ invoice, onSaved, onRemoved }: { invoice: InvoiceDetail; onSaved: () => void; onRemoved: () => void }) {
  const [remarks, setRemarks] = useState("");
  const empty = invoice.lines.length === 0 && invoice.payments.length === 0;
  const cancel = useMutation({
    mutationFn: () =>
      apiFetch(`/api/invoices/${invoice.id}/cancel`, { method: "POST", body: JSON.stringify({ remarks }) }),
    onSuccess: () => {
      toast.success("Bill cancelled.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/invoices/${invoice.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Bill removed.");
      onRemoved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Cancel</h2>
      {empty ? (
        <Button variant="outline" className="rounded-full" disabled={remove.isPending} onClick={() => remove.mutate()}>
          {remove.isPending ? "Removing…" : "Remove empty bill"}
        </Button>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            cancel.mutate();
          }}
        >
          <Field label="Reason" id="cancel-reason">
            <Input id="cancel-reason" value={remarks} onChange={(event) => setRemarks(event.target.value)} maxLength={300} required />
          </Field>
          <Button type="submit" variant="outline" className="rounded-full" disabled={cancel.isPending}>
            {cancel.isPending ? "Cancelling…" : "Cancel bill"}
          </Button>
        </form>
      )}
    </section>
  );
}

function NewBillDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  const customers = useQuery({
    queryKey: ["customers", "bill", q],
    enabled: open,
    queryFn: () => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      const suffix = params.size ? `?${params.toString()}` : "";
      return apiFetch<{ customers: Customer[] }>(`/api/customers${suffix}`);
    },
  });
  const create = useMutation({
    mutationFn: () => {
      if (!customerId) throw new Error("Choose a customer.");
      return apiFetch<{ invoice: InvoiceDetail }>("/api/invoices", {
        method: "POST",
        body: JSON.stringify({ customerId }),
      });
    },
    onSuccess: (result) => {
      setQ("");
      setCustomerId("");
      onOpenChange(false);
      onCreated(result.invoice.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New bill</DialogTitle>
          <DialogDescription>The bill number is assigned when the customer is chosen.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <Field label="Find customer" id="bill-customer-search">
            <Input id="bill-customer-search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Name, phone or book no." />
          </Field>
          <div className="max-h-48 space-y-1 overflow-auto">
            {(customers.data?.customers ?? []).map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${customerId === customer.id ? "bg-accent" : "hover:bg-muted"}`}
                onClick={() => setCustomerId(customer.id)}
              >
                {customer.name}
                {customer.phone ? ` · ${customer.phone}` : ""}
              </button>
            ))}
            {customers.data && customers.data.customers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No customers yet.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={create.isPending}>
              {create.isPending ? "Opening…" : "Open bill"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function query(input: { q: string; from: string; to: string; page?: number }): string {
  const params = new URLSearchParams();
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.page) params.set("page", String(input.page));
  const text = params.toString();
  return text ? `?${text}` : "";
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
