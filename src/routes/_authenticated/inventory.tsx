import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { formatPurchaseNumbers, type InventoryItem, type PurchaseLine } from "@/lib/inventory";
import { formatRupees, unitLabel, type Product, type ProductGroup } from "@/lib/products";
import { monthStart } from "@/lib/reports";
import { lineAmount, shopToday } from "@/lib/sales";
import { LabelSheet } from "@/components/app/BarcodeLabel";
import { ListFooter } from "@/components/app/ListFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — Ladies Collections" },
      { name: "description", content: "Stock rows and barcode labels for Ladies Collections." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div>
        <h1 className="text-4xl font-semibold">Inventory</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Stock by number, current quantity by group, purchase receipts, and barcode labels.
        </p>
      </div>
      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="current">Current stock</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="barcodes">Barcodes</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <StockPanel />
        </TabsContent>
        <TabsContent value="current">
          <CurrentStockPanel />
        </TabsContent>
        <TabsContent value="purchases">
          <PurchasesPanel />
        </TabsContent>
        <TabsContent value="barcodes">
          <BarcodePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StockPanel() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const [groupId, setGroupId] = useState("");
  const [productId, setProductId] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<InventoryItem | "new" | null>(null);
  const [stickers, setStickers] = useState<{ number: string; caption: string }[]>([]);
  useEffect(() => {
    if (stickers.length === 0) return;
    const frame = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(frame);
  }, [stickers]);
  const groups = useQuery({
    queryKey: ["product-groups"],
    queryFn: () => apiFetch<{ groups: ProductGroup[] }>("/api/product-groups"),
  });
  const products = useQuery({
    queryKey: ["products", "stock-filter", groupId],
    enabled: Boolean(groupId),
    queryFn: () => apiFetch<{ products: Product[] }>(`/api/products?groupId=${groupId}&picker=1`),
  });
  const stock = useQuery({
    queryKey: ["inventory", deferred, groupId, productId, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (deferred.trim()) params.set("q", deferred.trim());
      if (groupId) params.set("groupId", groupId);
      if (productId) params.set("productId", productId);
      params.set("page", String(page));
      return apiFetch<{ items: InventoryItem[]; total: number }>(`/api/inventory?${params.toString()}`);
    },
  });
  const rows = stock.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="grid items-center gap-2 md:grid-cols-[minmax(12rem,1fr)_10.5rem_12rem_auto]">
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Number, code or name"
          />
          <Select
            value={groupId || "all"}
            onValueChange={(value) => {
              setGroupId(value === "all" ? "" : value);
              setProductId("");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {(groups.data?.groups ?? []).map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={productId || "all"}
            onValueChange={(value) => {
              setProductId(value === "all" ? "" : value);
              setPage(1);
            }}
            disabled={!groupId}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={groupId ? "All products" : "Choose a group first"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {(products.data?.products ?? []).map((product) => (
                <SelectItem key={product.id} value={product.id}>
                  {product.code} · {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        <Button className="rounded-full" onClick={() => setEditor("new")}>
          Add stock
        </Button>
      </div>
      {stickers.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 print:hidden">
            <p className="text-sm text-muted-foreground">
              {stickers.length === 1
                ? `Label for ${stickers[0]?.number}. Stick it on that piece.`
                : `${stickers.length} labels. One sticker on each piece.`}
            </p>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => window.print()}>
              Print
            </Button>
          </div>
          <LabelSheet labels={stickers} />
        </div>
      ) : null}
      {stock.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {stock.error instanceof Error ? <p className="text-sm text-destructive">{stock.error.message}</p> : null}
      {!stock.isLoading && rows.length === 0 ? <p className="text-sm text-muted-foreground">No stock yet.</p> : null}
      {rows.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Inventory no.</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap font-mono text-sm font-medium">{item.inventoryNo}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{item.productCode}</TableCell>
                  <TableCell>{item.groupName}</TableCell>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{unitLabel(item.unit)}</TableCell>
                  <TableCell>{formatRupees(item.price)}</TableCell>
                  <TableCell>{formatQty(item.quantity)}</TableCell>
                  <TableCell>
                    <Badge variant={item.status === "available" ? "secondary" : "outline"} className="capitalize">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="rounded-full">
                          Actions
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setEditor(item)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            if (!window.confirm(`Remove inventory ${item.inventoryNo}? This cannot be undone.`)) return;
                            void apiFetch(`/api/inventory/${item.id}`, { method: "DELETE" })
                              .then(() => queryClient.invalidateQueries({ queryKey: ["inventory"] }))
                              .catch((reason: Error) => toast.error(reason.message));
                          }}
                        >
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <ListFooter page={page} total={stock.data?.total ?? 0} shown={rows.length} onPage={setPage} />
      <StockDialog
        open={editor !== null}
        item={editor === "new" ? null : editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSaved={(created) => {
          setEditor(null);
          if (created.length > 0) {
            setStickers(created.map((row) => ({ number: row.inventoryNo, caption: row.productName })));
          }
          void queryClient.invalidateQueries({ queryKey: ["inventory"] });
        }}
      />
    </div>
  );
}

function StockDialog({
  open,
  item,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (created: InventoryItem[]) => void;
}) {
  const [productQuery, setProductQuery] = useState("");
  const [productId, setProductId] = useState(item?.productId ?? "");
  const [inventoryNo, setInventoryNo] = useState(item?.inventoryNo ?? "");
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : "");
  const [supplierName, setSupplierName] = useState("");
  const [supplierBillNo, setSupplierBillNo] = useState("");
  const [cost, setCost] = useState("");
  const [seen, setSeen] = useState<string | null>(null);
  const mode = open ? (item?.id ?? "new") : null;
  if (mode && seen !== mode) {
    setSeen(mode);
    setProductQuery("");
    setProductId(item?.productId ?? "");
    setInventoryNo(item?.inventoryNo ?? "");
    setQuantity(item ? String(item.quantity) : "");
    setSupplierName("");
    setSupplierBillNo("");
    setCost("");
  }
  const products = useQuery({
    queryKey: ["products", "picker", productQuery],
    enabled: open,
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("picker", "1");
      if (productQuery.trim()) params.set("q", productQuery.trim());
      return apiFetch<{ products: Product[] }>(`/api/products?${params.toString()}`);
    },
  });
  const choices = products.data?.products ?? [];
  const selected = choices.find((product) => product.id === productId);

  const save = useMutation({
    mutationFn: () => {
      const amount = Number(quantity);
      if (!productId) throw new Error("Choose a product.");
      if (!Number.isFinite(amount)) throw new Error("Enter a quantity.");
      const paid = cost.trim() === "" ? undefined : Number(cost);
      if (paid !== undefined && !Number.isFinite(paid)) throw new Error("Enter the cost.");
      if (!item && (!supplierName.trim() || !supplierBillNo.trim() || paid === undefined)) {
        throw new Error("Enter the supplier, their bill number, and the cost.");
      }
      const body = JSON.stringify({
        productId,
        inventoryNo,
        quantity: amount,
        supplierName: supplierName.trim(),
        supplierBillNo: supplierBillNo.trim(),
        ...(paid === undefined ? {} : { cost: paid }),
      });
      if (item) return apiFetch(`/api/inventory/${item.id}`, { method: "PATCH", body });
      return apiFetch("/api/inventory", { method: "POST", body });
    },
    onSuccess: (result) => {
      const created = item ? [] : ((result as { items?: InventoryItem[] }).items ?? []);
      toast.success(item ? "Stock updated." : created.length > 1 ? `${created.length} pieces added.` : "Stock added.");
      onSaved(created);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit stock" : "Add stock"}</DialogTitle>
          <DialogDescription>
            {item
              ? "Quantity zero marks the number sold."
              : "One receipt: supplier, their bill, cost, then the product. Pieces with a blank inventory number get one IN number and one sticker each. Metres stay on one number. Saving prints the bars."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Find product" id="stock-find">
            <Input
              id="stock-find"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Code or name"
            />
          </Field>
          <Field label="Product" id="stock-product">
            <Select value={productId || undefined} onValueChange={setProductId}>
              <SelectTrigger id="stock-product">
                <SelectValue placeholder={products.isLoading ? "Loading…" : "Choose"} />
              </SelectTrigger>
              <SelectContent>
                {item && !choices.some((product) => product.id === item.productId) ? (
                  <SelectItem value={item.productId}>
                    {item.productCode} · {item.productName}
                  </SelectItem>
                ) : null}
                {choices.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.code} · {product.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {selected ? (
            <p className="text-xs text-muted-foreground">
              {selected.groupName} · {unitLabel(selected.unit)} · {formatRupees(selected.price)}
            </p>
          ) : null}
          <Field label="Inventory no." id="stock-number">
            <Input
              id="stock-number"
              value={inventoryNo}
              onChange={(event) => setInventoryNo(event.target.value)}
              maxLength={40}
              required={item !== null}
            />
          </Field>
          <Field label="Supplier" id="stock-supplier">
            <Input id="stock-supplier" value={supplierName} onChange={(event) => setSupplierName(event.target.value)} required={item === null} />
          </Field>
          <Field label="Supplier bill no." id="stock-supplier-bill">
            <Input id="stock-supplier-bill" value={supplierBillNo} onChange={(event) => setSupplierBillNo(event.target.value)} required={item === null} />
          </Field>
          <Field label="Cost each" id="stock-cost">
            <Input id="stock-cost" value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" required={item === null} />
          </Field>
          <Field label="Quantity" id="stock-qty">
            <Input
              id="stock-qty"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : item ? "Save" : "Add stock"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BarcodePanel() {
  const [starting, setStarting] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [numbers, setNumbers] = useState<string[]>([]);
  const print = useMutation({
    mutationFn: () => {
      const count = Number(quantity);
      if (!Number.isFinite(count)) throw new Error("Enter how many labels.");
      const params = new URLSearchParams({ starting: starting.trim(), quantity: String(count) });
      return apiFetch<{ numbers: string[] }>(`/api/inventory/barcodes?${params.toString()}`);
    },
    onSuccess: (result) => setNumbers(result.numbers),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        The bars are the inventory number, including IN. The billing gun reads them. Showing labels does not add stock.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          print.mutate();
        }}
      >
        <Field label="Starting number" id="barcode-start">
          <Input id="barcode-start" value={starting} onChange={(event) => setStarting(event.target.value)} className="w-40" required />
        </Field>
        <Field label="Labels" id="barcode-count">
          <Input id="barcode-count" value={quantity} onChange={(event) => setQuantity(event.target.value)} className="w-28" required />
        </Field>
        <Button type="submit" className="rounded-full" disabled={print.isPending}>
          {print.isPending ? "Preparing…" : "Show labels"}
        </Button>
        {numbers.length > 0 ? (
          <Button type="button" variant="outline" className="rounded-full" onClick={() => window.print()}>
            Print
          </Button>
        ) : null}
      </form>
      {numbers.length > 0 ? <LabelSheet labels={numbers.map((number) => ({ number, caption: "" }))} /> : null}
    </div>
  );
}

type StockGroup = { id: string; name: string; quantity: number; amount: number };

function CurrentStockPanel() {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const summary = useQuery({
    queryKey: ["inventory-summary"],
    queryFn: () => apiFetch<{ groups: StockGroup[]; slips: number; quantity: number }>("/api/inventory/summary"),
  });
  const detail = useQuery({
    queryKey: ["inventory", "available", groupId, page],
    enabled: Boolean(groupId),
    queryFn: () => apiFetch<{ items: InventoryItem[]; total: number }>(`/api/inventory?groupId=${groupId}&available=1&page=${page}`),
  });
  const groups = summary.data?.groups ?? [];
  const selected = groups.find((group) => group.id === groupId);

  if (groupId) {
    const rows = detail.data?.items ?? [];
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setGroupId(null);
              setPage(1);
            }}
          >
            Back
          </Button>
          <p className="text-sm text-muted-foreground">{selected?.name ?? "Group"} · available stock</p>
        </div>
        {detail.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {rows.length === 0 && !detail.isLoading ? <p className="text-sm text-muted-foreground">No available stock in this group.</p> : null}
        {rows.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inventory no.</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap font-mono text-sm font-medium">{item.inventoryNo}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-sm">{item.productCode}</TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{formatQty(item.quantity)}</TableCell>
                    <TableCell>{formatRupees(item.price)}</TableCell>
                    <TableCell>{formatRupees(lineAmount(item.quantity, item.price))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <ListFooter page={page} total={detail.data?.total ?? 0} shown={rows.length} onPage={setPage} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {summary.error instanceof Error ? <p className="text-sm text-destructive">{summary.error.message}</p> : null}
      {!summary.isLoading && groups.length === 0 ? <p className="text-sm text-muted-foreground">No available stock.</p> : null}
      {groups.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {formatQty(summary.data?.quantity ?? 0)} on the shelf across {summary.data?.slips.toLocaleString("en-IN")} inventory numbers. A piece counts as 1 and fabric counts as metres, so this is not the number of rows on the stock list. Sold numbers stay on that list and are not in this total.
          </p>
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sl.no.</TableHead>
                <TableHead>Product group</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group, index) => (
                <TableRow key={group.id}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{formatQty(group.quantity)}</TableCell>
                  <TableCell>{formatRupees(group.amount)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setPage(1);
                        setGroupId(group.id);
                      }}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </div>
      ) : null}
    </div>
  );
}

function PurchasesPanel() {
  const today = shopToday();
  const start = monthStart(today);
  const [from, setFrom] = useState(start);
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: start, to: today });
  const purchases = useQuery({
    queryKey: ["purchases", range],
    queryFn: () => {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      return apiFetch<{ purchases: PurchaseLine[]; truncated: boolean }>(`/api/inventory/purchases?${params.toString()}`);
    },
  });
  const rows = purchases.data?.purchases ?? [];

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setRange({ from, to });
        }}
      >
        <Field label="From date" id="purchase-from">
          <Input id="purchase-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
        </Field>
        <Field label="To date" id="purchase-to">
          <Input id="purchase-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
        </Field>
        <Button type="submit" className="rounded-full">
          Get
        </Button>
        {rows.length > 0 ? (
          <Button type="button" variant="outline" className="rounded-full" onClick={() => downloadPurchases(rows)}>
            Spreadsheet
          </Button>
        ) : null}
      </form>
      {purchases.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {purchases.error instanceof Error ? <p className="text-sm text-destructive">{purchases.error.message}</p> : null}
      {purchases.data?.truncated ? (
        <p className="text-sm text-muted-foreground">Showing the first 2,000 stock rows in this range.</p>
      ) : null}
      {!purchases.isLoading && rows.length === 0 ? <p className="text-sm text-muted-foreground">No purchases in this range.</p> : null}
      {rows.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sl.no.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Bill</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Inventory nos.</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={`${row.date}-${row.productId}`}>
                  <TableCell>{index + 1}</TableCell>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.productCode}</TableCell>
                  <TableCell>{row.groupName}</TableCell>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell>{receiptBlank(row.supplierName)}</TableCell>
                  <TableCell>{receiptBlank(row.supplierBillNo)}</TableCell>
                  <TableCell>{row.cost == null ? "Migrated — not recorded" : formatRupees(row.cost)}</TableCell>
                  <TableCell>
                    {formatQty(row.quantity)} {row.unit}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{formatPurchaseNumbers(row.inventoryNos)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

function downloadPurchases(rows: PurchaseLine[]) {
  const header = ["Date", "Product code", "Product group", "Product name", "Supplier", "Supplier bill", "Cost", "Quantity", "Unit", "Inventory nos."];
  const body = rows.map((row) => [
    row.date,
    row.productCode,
    row.groupName,
    row.productName,
    receiptBlank(row.supplierName),
    receiptBlank(row.supplierBillNo),
    row.cost == null ? "Migrated — not recorded" : String(row.cost),
    String(row.quantity),
    row.unit,
    formatPurchaseNumbers(row.inventoryNos),
  ]);
  const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "purchases.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function receiptBlank(value: string): string {
  return value.trim() ? value : "Migrated — not recorded";
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
