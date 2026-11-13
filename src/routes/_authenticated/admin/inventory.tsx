import { useDeferredValue, useEffect, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  formatPurchaseNumbers,
  INVENTORY_SORTS,
  type InventoryItem,
  type InventorySort,
  type PurchaseLine,
} from "@/lib/inventory";
import { formatRupees, unitLabel, type Product, type ProductGroup } from "@/lib/products";
import { monthStart } from "@/lib/reports";
import { lineAmount, shopToday } from "@/lib/sales";
import { LabelSheet, type BarcodeLabel } from "@/components/app/BarcodeLabel";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
import { ListFooter } from "@/components/app/ListFooter";
import { DeskTable, PhoneCard, PhoneCards } from "@/components/app/PhoneList";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/inventory")({
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
    <div className="mx-auto max-w-[100rem] space-y-8 p-4 md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">Inventory</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Stock by number, current quantity by group, purchase receipts, and barcode labels.
          </p>
        </div>
      </div>
      <Tabs defaultValue="stock">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
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
  const [sort, setSort] = useState<InventorySort>("latest");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<InventoryItem | "new" | null>(null);
  const [stickers, setStickers] = useState<BarcodeLabel[]>([]);
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
    queryKey: ["inventory", deferred, groupId, productId, sort, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (deferred.trim()) params.set("q", deferred.trim());
      if (groupId) params.set("groupId", groupId);
      if (productId) params.set("productId", productId);
      params.set("sort", sort);
      params.set("page", String(page));
      return apiFetch<{ items: InventoryItem[]; total: number }>(
        `/api/inventory?${params.toString()}`,
      );
    },
  });
  const rows = stock.data?.items ?? [];

  return (
    <div className="space-y-4">
      <ExportExcelButton
        filename="stock"
        load={async () => {
          const params = new URLSearchParams({ export: "1" });
          if (deferred.trim()) params.set("q", deferred.trim());
          if (groupId) params.set("groupId", groupId);
          if (productId) params.set("productId", productId);
          params.set("sort", sort);
          const data = await apiFetch<{ items: InventoryItem[] }>(
            `/api/inventory?${params.toString()}`,
          );
          return [
            {
              name: "Stock",
              columns: [
                "Inventory no.",
                "Code",
                "Product",
                "Group",
                "Unit",
                "Price",
                "Quantity",
                "Status",
              ],
              rows: data.items.map((item) => [
                item.inventoryNo,
                item.productCode,
                item.productName,
                item.groupName,
                item.unit,
                item.price,
                item.quantity,
                item.status,
              ]),
            },
          ];
        }}
      />
      <div className="grid items-center gap-2 md:grid-cols-2 2xl:grid-cols-[minmax(12rem,1fr)_10.5rem_12rem_11rem_auto]">
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
        <Select
          value={sort}
          onValueChange={(value) => {
            setSort(value as InventorySort);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Sort inventory">
            <SelectValue placeholder="Sort inventory" />
          </SelectTrigger>
          <SelectContent>
            {INVENTORY_SORTS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
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
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => window.print()}
            >
              Print
            </Button>
          </div>
          <LabelSheet labels={stickers} />
        </div>
      ) : null}
      {stock.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {stock.error instanceof Error ? (
        <p className="text-sm text-destructive">{stock.error.message}</p>
      ) : null}
      {!stock.isLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stock yet.</p>
      ) : null}
      {rows.length > 0 ? (
        <>
          <PhoneCards>
            {rows.map((item) => (
              <PhoneCard
                key={item.id}
                title={item.inventoryNo}
                detail={`${item.productCode} · ${item.groupName} · ${item.productName} · ${unitLabel(item.unit)} · ${formatRupees(item.price)} · qty ${formatQty(item.quantity)} · ${item.status}`}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setEditor(item)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Remove inventory ${item.inventoryNo}? This cannot be undone.`,
                      )
                    )
                      return;
                    void apiFetch(`/api/inventory/${item.id}`, { method: "DELETE" })
                      .then(() => queryClient.invalidateQueries({ queryKey: ["inventory"] }))
                      .catch((reason: Error) => toast.error(reason.message));
                  }}
                >
                  Remove
                </Button>
              </PhoneCard>
            ))}
          </PhoneCards>
          <DeskTable>
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
                    <TableCell className="whitespace-nowrap font-mono text-sm font-medium">
                      {item.inventoryNo}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-sm">
                      {item.productCode}
                    </TableCell>
                    <TableCell>{item.groupName}</TableCell>
                    <TableCell>{item.productName}</TableCell>
                    <TableCell>{unitLabel(item.unit)}</TableCell>
                    <TableCell>{formatRupees(item.price)}</TableCell>
                    <TableCell>{formatQty(item.quantity)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={item.status === "available" ? "secondary" : "outline"}
                        className="capitalize"
                      >
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
                              if (
                                !window.confirm(
                                  `Remove inventory ${item.inventoryNo}? This cannot be undone.`,
                                )
                              )
                                return;
                              void apiFetch(`/api/inventory/${item.id}`, { method: "DELETE" })
                                .then(() =>
                                  queryClient.invalidateQueries({ queryKey: ["inventory"] }),
                                )
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
          </DeskTable>
        </>
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
            setStickers(
              created.map((row) => ({
                number: row.inventoryNo,
                caption: row.productName,
                price: row.price,
              })),
            );
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
      if (!item && paid === undefined) throw new Error("Enter the cost.");
      if (paid !== undefined && !Number.isFinite(paid)) throw new Error("Enter the cost.");
      const body = JSON.stringify({
        productId,
        inventoryNo: item?.inventoryNo ?? "",
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
      toast.success(
        item
          ? "Stock updated."
          : created.length > 1
            ? `${created.length} pieces added.`
            : "Stock added.",
      );
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
              : "Choose an existing product, then enter its cost and quantity. The product code is shown for confirmation, and inventory numbers are assigned automatically. Pieces get one number each; metres stay on one number."}
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
          <p className="text-xs text-muted-foreground">
            Inventory numbers are assigned automatically when stock is added.
          </p>
          {item ? (
            <>
              <Field label="Supplier" id="stock-supplier">
                <Input
                  id="stock-supplier"
                  value={supplierName}
                  onChange={(event) => setSupplierName(event.target.value)}
                />
              </Field>
              <Field label="Supplier bill no." id="stock-supplier-bill">
                <Input
                  id="stock-supplier-bill"
                  value={supplierBillNo}
                  onChange={(event) => setSupplierBillNo(event.target.value)}
                />
              </Field>
            </>
          ) : null}
          <Field label="Cost each" id="stock-cost">
            <Input
              id="stock-cost"
              value={cost}
              onChange={(event) => setCost(event.target.value)}
              inputMode="decimal"
              required={!item}
            />
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
  const [labels, setLabels] = useState<BarcodeLabel[]>([]);
  const print = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams({ starting: starting.trim() });
      return apiFetch<{ numbers: string[]; labels: BarcodeLabel[] }>(
        `/api/inventory/barcodes?${params.toString()}`,
      );
    },
    onSuccess: (result) => setLabels(result.labels),
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter a product code to show a label for every available inventory number for that product,
        or an inventory number to show labels based on that stock's quantity. Review the inventory
        numbers and prices below, then click Print. Showing labels does not add or change stock.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setLabels([]);
          print.mutate();
        }}
      >
        <Field label="Product code or inventory no." id="barcode-start">
          <Input
            id="barcode-start"
            value={starting}
            onChange={(event) => {
              setStarting(event.target.value);
              setLabels([]);
            }}
            className="w-48"
            placeholder="SR-0002 or IN0021288"
            required
          />
        </Field>
        <Button type="submit" className="rounded-full" disabled={print.isPending}>
          {print.isPending ? "Preparing preview…" : "Show"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          disabled={print.isPending}
          onClick={() => {
            if (labels.length === 0) {
              print.mutate();
              return;
            }
            window.print();
          }}
        >
          Print
        </Button>
        {labels.length > 0 ? (
          <ExportExcelButton
            filename="barcode-labels"
            load={async () => [
              {
                name: "Labels",
                columns: ["Inventory no."],
                rows: labels.map(({ number }) => [number]),
              },
            ]}
          />
        ) : null}
      </form>
      {labels.length > 0 ? (
        <section className="space-y-3" aria-label="Barcode label preview">
          <div className="text-sm font-medium">
            Preview · {labels.length} label
            {labels.length === 1 ? "" : "s"}
          </div>
          <LabelSheet labels={labels} />
        </section>
      ) : null}
    </div>
  );
}

type StockGroup = { id: string; name: string; quantity: number; amount: number };

function CurrentStockPanel() {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const summary = useQuery({
    queryKey: ["inventory-summary"],
    queryFn: () =>
      apiFetch<{ groups: StockGroup[]; slips: number; quantity: number }>("/api/inventory/summary"),
  });
  const detail = useQuery({
    queryKey: ["inventory", "available", groupId, page],
    enabled: Boolean(groupId),
    queryFn: () =>
      apiFetch<{ items: InventoryItem[]; total: number }>(
        `/api/inventory?groupId=${groupId}&available=1&page=${page}`,
      ),
  });
  const groups = summary.data?.groups ?? [];
  const totalQuantity = summary.data?.quantity ?? 0;
  const totalValue = groups.reduce((paise, group) => paise + Math.round(group.amount * 100), 0) / 100;
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
          <p className="text-sm text-muted-foreground">
            {selected?.name ?? "Group"} · available stock
          </p>
          <ExportExcelButton
            filename="current-stock"
            load={async () => {
              const data = await apiFetch<{ items: InventoryItem[] }>(
                `/api/inventory?groupId=${groupId}&available=1&export=1`,
              );
              return [
                {
                  name: "Current stock",
                  columns: ["Inventory no.", "Code", "Product", "Qty", "Price", "Amount"],
                  rows: data.items.map((item) => [
                    item.inventoryNo,
                    item.productCode,
                    item.productName,
                    item.quantity,
                    item.price,
                    lineAmount(item.quantity, item.price),
                  ]),
                },
              ];
            }}
          />
        </div>
        {detail.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {rows.length === 0 && !detail.isLoading ? (
          <p className="text-sm text-muted-foreground">No available stock in this group.</p>
        ) : null}
        {rows.length > 0 ? (
          <>
            <PhoneCards>
              {rows.map((item) => (
                <PhoneCard
                  key={item.id}
                  title={item.inventoryNo}
                  detail={`${item.productCode} · ${item.productName} · qty ${formatQty(item.quantity)} · ${formatRupees(item.price)} · ${formatRupees(lineAmount(item.quantity, item.price))}`}
                />
              ))}
            </PhoneCards>
            <DeskTable>
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
                      <TableCell className="whitespace-nowrap font-mono text-sm font-medium">
                        {item.inventoryNo}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-sm">
                        {item.productCode}
                      </TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell>{formatQty(item.quantity)}</TableCell>
                      <TableCell>{formatRupees(item.price)}</TableCell>
                      <TableCell>{formatRupees(lineAmount(item.quantity, item.price))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DeskTable>
          </>
        ) : null}
        <ListFooter
          page={page}
          total={detail.data?.total ?? 0}
          shown={rows.length}
          onPage={setPage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {summary.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {summary.error instanceof Error ? (
        <p className="text-sm text-destructive">{summary.error.message}</p>
      ) : null}
      {!summary.isLoading && groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No available stock.</p>
      ) : null}
      {groups.length > 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {formatQty(totalQuantity)} on the shelf across{" "}
            {summary.data?.slips.toLocaleString("en-IN")} inventory numbers. A piece counts as 1 and
            fabric counts as metres, so this is not the number of rows on the stock list. Sold
            numbers stay on that list and are not in this total. Total stock value:{" "}
            <strong>{formatRupees(totalValue)}</strong>.
          </p>
          <ExportExcelButton
            filename="current-stock"
            load={async () => [
              {
                name: "Current stock",
                columns: ["Group", "Quantity", "Amount"],
                rows: [
                  ...groups.map((group) => [group.name, group.quantity, group.amount]),
                  ["Total", totalQuantity, totalValue],
                ],
              },
            ]}
          />
          <PhoneCards>
            {groups.map((group) => (
              <PhoneCard
                key={group.id}
                title={group.name}
                detail={`${formatQty(group.quantity)} · ${formatRupees(group.amount)}`}
              >
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
              </PhoneCard>
            ))}
          </PhoneCards>
          <DeskTable>
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
          </DeskTable>
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
      return apiFetch<{ purchases: PurchaseLine[]; truncated: boolean }>(
        `/api/inventory/purchases?${params.toString()}`,
      );
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
          <Input
            id="purchase-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
          />
        </Field>
        <Field label="To date" id="purchase-to">
          <Input
            id="purchase-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            required
          />
        </Field>
        <Button type="submit" className="rounded-full">
          Get
        </Button>
        <ExportExcelButton
          filename="purchases"
          load={async () => [
            {
              name: "Purchases",
              columns: [
                "Date",
                "Product code",
                "Product group",
                "Product name",
                "Supplier",
                "Supplier bill",
                "Cost",
                "Quantity",
                "Unit",
                "Inventory nos.",
              ],
              rows: rows.map((row) => [
                row.date,
                row.productCode,
                row.groupName,
                row.productName,
                receiptBlank(row.supplierName),
                receiptBlank(row.supplierBillNo),
                row.cost,
                row.quantity,
                row.unit,
                formatPurchaseNumbers(row.inventoryNos),
              ]),
            },
          ]}
        />
      </form>
      {purchases.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {purchases.error instanceof Error ? (
        <p className="text-sm text-destructive">{purchases.error.message}</p>
      ) : null}
      {purchases.data?.truncated ? (
        <p className="text-sm text-muted-foreground">
          Showing the first 2,000 stock rows in this range.
        </p>
      ) : null}
      {!purchases.isLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No purchases in this range.</p>
      ) : null}
      {rows.length > 0 ? (
        <>
          <PhoneCards>
            {rows.map((row, index) => (
              <PhoneCard
                key={`${row.date}-${row.productId}-${index}`}
                title={row.productName}
                detail={`${row.date} · ${row.productCode} · ${row.groupName} · ${formatQty(row.quantity)} ${row.unit} · ${receiptBlank(row.supplierName)} · ${formatPurchaseNumbers(row.inventoryNos)}`}
              />
            ))}
          </PhoneCards>
          <DeskTable>
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
                    <TableCell>
                      {row.cost == null ? "Not recorded" : formatRupees(row.cost)}
                    </TableCell>
                    <TableCell>
                      {formatQty(row.quantity)} {row.unit}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-sm">
                      {formatPurchaseNumbers(row.inventoryNos)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DeskTable>
        </>
      ) : null}
    </div>
  );
}

function receiptBlank(value: string): string {
  return value.trim() ? value : "Not recorded";
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
