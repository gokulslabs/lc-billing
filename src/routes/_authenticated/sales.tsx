import { useDeferredValue, useEffect, useRef, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { Customer } from "@/lib/customers";
import { formatRupees } from "@/lib/products";
import type { InvoiceDetail, InvoiceItem, InvoiceSummary } from "@/lib/sales";
import { lineAmount, PAYMENT_MODES, shopToday, type BillPay, type BillSort } from "@/lib/sales";
import { ListFooter } from "@/components/app/ListFooter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const opening = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("view") : null;
  const [billId, setBillId] = useState<string | null>(null);
  const [list, setList] = useState(true);
  if (billId) {
    return (
      <BillScreen
        id={billId}
        onBack={() => {
          setBillId(null);
          setList(true);
        }}
      />
    );
  }
  if (!list) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-6 md:p-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold">New bill</h1>
            <p className="mt-2 text-sm text-muted-foreground">Choose the customer in front of you. The inventory box is next.</p>
          </div>
          <Button variant="outline" className="rounded-full" onClick={() => setList(true)}>
            Bill list
          </Button>
        </div>
        <NewBillForm onCreated={setBillId} />
      </div>
    );
  }
  return (
    <SalesHome
      onOpen={setBillId}
      onNew={() => setList(false)}
      startTab={opening === "due" ? "due" : opening === "close" ? "close" : "bills"}
    />
  );
}

function SalesHome({ onOpen, onNew, startTab }: { onOpen: (id: string) => void; onNew: () => void; startTab: string }) {
  const today = shopToday();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const [from, setFrom] = useState("2000-01-01");
  const [to, setTo] = useState(today);
  const [pay, setPay] = useState<BillPay>("all");
  const [sort, setSort] = useState<BillSort>("date");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const bills = useQuery({
    queryKey: ["invoices", deferred, from, to, pay, sort, direction, page],
    queryFn: () =>
      apiFetch<{ invoices: InvoiceSummary[]; total: number }>(
        `/api/invoices${query({ q: deferred, from, to, page, pay, sort, dir: direction })}`,
      ),
  });
  const items = useQuery({
    queryKey: ["invoice-items", deferred, from, to, page],
    queryFn: () => apiFetch<{ items: InvoiceItem[]; total: number }>(`/api/invoices/items${query({ q: deferred, from, to, page })}`),
  });
  const rows = bills.data?.invoices ?? [];
  function chooseSort(column: BillSort) {
    setPage(1);
    if (sort === column) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSort(column);
    setDirection(column === "customer" || column === "bill" || column === "date" ? "asc" : "desc");
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Sales & billing</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every bill in the dates, with gross, discount, and net. Not paid keeps only a balance.
          </p>
        </div>
        <Button className="rounded-full" onClick={onNew}>
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
        <Select
          value={pay}
          onValueChange={(value) => {
            const next = value as BillPay;
            setPay(next);
            setPage(1);
            if (next === "unpaid") {
              setSort("balance");
              setDirection("desc");
            }
          }}
        >
          <SelectTrigger className="w-40" aria-label="Payment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All bills</SelectItem>
            <SelectItem value="unpaid">Not paid</SelectItem>
            <SelectItem value="paid">Paid in full</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Tabs defaultValue={startTab}>
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="due">Who owes</TabsTrigger>
          <TabsTrigger value="close">Day close</TabsTrigger>
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
                    <SortHead label="Bill no." column="bill" sort={sort} direction={direction} onSort={chooseSort} />
                    <SortHead label="Date" column="date" sort={sort} direction={direction} onSort={chooseSort} />
                    <SortHead label="Customer" column="customer" sort={sort} direction={direction} onSort={chooseSort} />
                    <SortHead label="Gross" column="gross" sort={sort} direction={direction} onSort={chooseSort} />
                    <SortHead label="Discount" column="discount" sort={sort} direction={direction} onSort={chooseSort} />
                    <SortHead label="Net" column="net" sort={sort} direction={direction} onSort={chooseSort} />
                    <SortHead label="Collected" column="collected" sort={sort} direction={direction} onSort={chooseSort} />
                    <SortHead label="Balance" column="balance" sort={sort} direction={direction} onSort={chooseSort} />
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((bill) => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium">{bill.billNo}</TableCell>
                      <TableCell className="whitespace-nowrap">{slashDate(bill.billedOn)}</TableCell>
                      <TableCell>
                        <Link to="/customers/$customerId" params={{ customerId: bill.customerId }} className="hover:underline">
                          {bill.customerName}
                        </Link>
                      </TableCell>
                      <TableCell>{formatRupees(bill.gross)}</TableCell>
                      <TableCell>{formatRupees(bill.discount)}</TableCell>
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
        <TabsContent value="due">
          <DueList onOpen={onOpen} />
        </TabsContent>
        <TabsContent value="close">
          <DayClose />
        </TabsContent>
      </Tabs>
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
        {invoice ? (
          <div className="flex items-center gap-3 print:hidden">
            <p className="font-display text-3xl font-semibold">{formatRupees(invoice.total)}</p>
            <Button variant="outline" className="rounded-full" onClick={() => window.print()}>
              Print
            </Button>
          </div>
        ) : null}
      </div>
      {bill.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {bill.error instanceof Error ? <p className="text-sm text-destructive">{bill.error.message}</p> : null}
      {invoice?.remarks ? <p className="text-sm text-muted-foreground">Reason: {invoice.remarks}</p> : null}
      {invoice && invoice.status === "open" ? <LineForm invoiceId={invoice.id} onSaved={refresh} /> : null}
      {invoice ? <Receipt invoice={invoice} /> : null}
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
                <TableHead>Discount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-muted-foreground">
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
                  <TableCell>{formatRupees(line.discount)}</TableCell>
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
                            .then(() => {
                              toast.success(`${line.inventoryNo} is back on the shelf.`);
                              refresh();
                            })
                            .catch((reason: Error) => toast.error(reason.message));
                        }}
                      >
                        Return
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
            <p className="text-sm text-muted-foreground">
              Gross {formatRupees(invoice.lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.rate), 0))} · Discount{" "}
              {formatRupees(invoice.lines.reduce((sum, line) => sum + line.discount, 0))} · Balance {formatRupees(invoice.balance)}
            </p>
            {invoice.payments.map((payment) => (
              <p key={payment.id} className="text-sm">
                {payment.paidOn} · {payment.mode ?? "Not recorded"} · {formatRupees(payment.amount)}
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
        preview: { productCode: string; groupName: string; productName: string; rate: number; discountPercent: number; status: string; available: number };
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
          {formatRupees(preview.data.preview.rate)}
          {preview.data.preview.discountPercent ? ` · ${preview.data.preview.discountPercent}% off` : ""} · {preview.data.preview.status} ·{" "}
          {preview.data.preview.available} left
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
  const [mode, setMode] = useState<(typeof PAYMENT_MODES)[number]>("CASH");
  const [showroom, setShowroom] = useState("");
  const save = useMutation({
    mutationFn: () => {
      const value = Number(amount);
      if (!Number.isFinite(value)) throw new Error("Enter an amount.");
      return apiFetch(`/api/invoices/${invoiceId}/payments`, {
        method: "POST",
        body: JSON.stringify({ amount: value, paidOn, mode, showroom }),
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
      <Field label="How it was paid" id="collect-mode">
        <Select value={mode} onValueChange={(value) => setMode(value as (typeof PAYMENT_MODES)[number])}>
          <SelectTrigger id="collect-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_MODES.map((item) => (
              <SelectItem key={item} value={item}>
                {item === "CASH" ? "Cash" : item === "UPI" ? "UPI" : "Card"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Note" id="collect-showroom">
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

function NewBillForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [customerId, setCustomerId] = useState("");
  const customers = useQuery({
    queryKey: ["customers", "bill", q],
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
      onCreated(result.invoice.id);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
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
          <Button type="submit" className="rounded-full" disabled={create.isPending}>
            {create.isPending ? "Opening…" : "Open bill"}
          </Button>
        </form>
  );
}

function Receipt({ invoice }: { invoice: InvoiceDetail }) {
  const gross = invoice.lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.rate), 0);
  const discount = invoice.lines.reduce((sum, line) => sum + line.discount, 0);
  return (
    <section className="receipt hidden print:block">
      <style>{`@media print { body * { visibility: hidden !important; } .receipt, .receipt * { visibility: visible !important; } .receipt { position: absolute; left: 0; top: 0; width: 100%; background: white; color: black; padding: 24px; } }`}</style>
      <p className="text-xs uppercase tracking-[0.2em]">Ladies Collections</p>
      <h1 className="mt-2 text-3xl font-semibold">Bill {invoice.billNo}</h1>
      <p className="mt-1 text-sm">{invoice.customerName} · {invoice.billedOn}</p>
      <div className="mt-4 space-y-2 text-sm">
        {invoice.lines.map((line) => (
          <p key={line.id}>
            {line.inventoryNo} · {line.productName} · {line.quantity} × {formatRupees(line.rate)}
            {line.discount ? ` · off ${formatRupees(line.discount)}` : ""} · {formatRupees(line.amount)}
          </p>
        ))}
      </div>
      <p className="mt-4 text-sm">Gross {formatRupees(gross)} · Discount {formatRupees(discount)} · Net {formatRupees(invoice.total)}</p>
      {invoice.payments.map((payment) => (
        <p key={payment.id} className="text-sm">
          Paid {payment.paidOn} · {payment.mode ?? "Not recorded"} · {formatRupees(payment.amount)}
        </p>
      ))}
      <p className="mt-2 text-lg font-semibold">Balance {formatRupees(invoice.balance)}</p>
    </section>
  );
}

function DueList({ onOpen }: { onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const due = useQuery({
    queryKey: ["invoices-due", page],
    queryFn: () => apiFetch<{ invoices: InvoiceSummary[]; total: number }>(`/api/invoices/due?page=${page}`),
  });
  const rows = due.data?.invoices ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Open bills with a balance. Oldest first.</p>
      {due.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {due.error instanceof Error ? <p className="text-sm text-destructive">{due.error.message}</p> : null}
      {!due.isLoading && rows.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is owing.</p> : null}
      {rows.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bill no.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">{invoice.billNo}</TableCell>
                  <TableCell>{invoice.billedOn}</TableCell>
                  <TableCell>{invoice.customerName}</TableCell>
                  <TableCell>{formatRupees(invoice.total)}</TableCell>
                  <TableCell>{formatRupees(invoice.balance)}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => onOpen(invoice.id)}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <ListFooter page={page} total={due.data?.total ?? 0} shown={rows.length} onPage={setPage} />
    </div>
  );
}

function DayClose() {
  const [date, setDate] = useState(shopToday());
  const close = useQuery({
    queryKey: ["day-close", date],
    queryFn: () =>
      apiFetch<{ date: string; bills: number; billed: number; collected: number; due: number; unpaid: number; modes: { mode: string; amount: number }[] }>(
        `/api/invoices/close?date=${date}`,
      ),
  });
  const day = close.data;
  return (
    <div className="space-y-4">
      <Field label="Date" id="close-date">
        <Input id="close-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-40" />
      </Field>
      {close.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {close.error instanceof Error ? <p className="text-sm text-destructive">{close.error.message}</p> : null}
      {day ? (
        <div className="grid gap-4 md:grid-cols-3">
          <CloseCard label="Billed" value={formatRupees(day.billed)} note={`${day.bills} bills`} />
          <CloseCard label="Collected today" value={formatRupees(day.collected)} note="Money that came in, including older bills" />
          <CloseCard label="Still due on these bills" value={formatRupees(day.due)} note={`${day.unpaid} unpaid`} />
          {day.modes.map((mode) => (
            <CloseCard key={mode.mode} label={mode.mode === "CASH" ? "Cash" : mode.mode === "UPI" ? "UPI" : "Card"} value={formatRupees(mode.amount)} note="Collected today" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CloseCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function query(input: { q: string; from: string; to: string; page?: number; pay?: BillPay; sort?: BillSort; dir?: "asc" | "desc" }): string {
  const params = new URLSearchParams();
  if (input.q.trim()) params.set("q", input.q.trim());
  if (input.from) params.set("from", input.from);
  if (input.to) params.set("to", input.to);
  if (input.pay && input.pay !== "all") params.set("pay", input.pay);
  if (input.sort) params.set("sort", input.sort);
  if (input.dir) params.set("dir", input.dir);
  if (input.page) params.set("page", String(input.page));
  const text = params.toString();
  return text ? `?${text}` : "";
}

function SortHead({
  label,
  column,
  sort,
  direction,
  onSort,
}: {
  label: string;
  column: BillSort;
  sort: BillSort;
  direction: "asc" | "desc";
  onSort: (column: BillSort) => void;
}) {
  const active = sort === column;
  return (
    <TableHead>
      <button type="button" className="inline-flex items-center gap-1 font-medium" onClick={() => onSort(column)}>
        {label}
        {active ? <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span> : null}
      </button>
    </TableHead>
  );
}

function slashDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-");
  return day && month && year ? `${day}-${month}-${year}` : value;
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
