import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { InventoryItem } from "@/lib/inventory";
import { formatRupees, unitLabel } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
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

export const Route = createFileRoute("/_authenticated/stock-verification")({
  head: () => ({
    meta: [
      { title: "Stock verification — Ladies Collections" },
      { name: "description", content: "Scan the shelf, record what was found, and correct stock." },
    ],
  }),
  component: StockVerificationPage,
});

const TABS = [
  { id: "scanning", label: "Stock scanning" },
  { id: "verified", label: "Stock verified list" },
  { id: "shortage", label: "Stock shortage list" },
  { id: "status", label: "Change status" },
  { id: "quantity", label: "Change quantity" },
] as const;

function StockVerificationPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-10">
      <div>
        <h1 className="text-3xl font-semibold md:text-4xl">Stock verification</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Scan each number on the shelf. Verified stock is recorded, and unscanned available stock
          stays on the shortage list.
        </p>
      </div>
      <Tabs defaultValue="scanning">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="scanning" className="mt-6">
          <Lookup mode="scan" />
        </TabsContent>
        <TabsContent value="verified" className="mt-6">
          <VerificationList view="verified" />
        </TabsContent>
        <TabsContent value="shortage" className="mt-6">
          <VerificationList view="shortage" />
        </TabsContent>
        <TabsContent value="status" className="mt-6">
          <Lookup mode="status" />
        </TabsContent>
        <TabsContent value="quantity" className="mt-6">
          <Lookup mode="quantity" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Lookup({ mode }: { mode: "scan" | "status" | "quantity" }) {
  const queryClient = useQueryClient();
  const [number, setNumber] = useState("");
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("available");
  const [quantity, setQuantity] = useState("");
  const lookup = useMutation({
    mutationFn: async () => {
      const query = number.trim();
      if (!query) throw new Error("Enter an inventory number.");
      const data = await apiFetch<{ items: InventoryItem[] }>(
        `/api/inventory?q=${encodeURIComponent(query)}`,
      );
      return (
        data.items.find((row) => row.inventoryNo.toUpperCase() === query.toUpperCase()) ?? null
      );
    },
    onSuccess: (found) => {
      setItem(found);
      setMessage(found ? "" : "That inventory number is not on the stock list.");
      if (found) {
        setStatus(found.status === "sold" ? "sold" : "available");
        setQuantity(String(found.quantity));
      }
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const record = useMutation({
    mutationFn: (path: string) => apiFetch<{ item: InventoryItem }>(path, { method: "POST" }),
    onSuccess: ({ item: saved }) => {
      setItem(saved);
      setMessage(`Recorded ${saved.inventoryNo} as verified.`);
      void queryClient.invalidateQueries({ queryKey: ["stock-verification"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const update = useMutation({
    mutationFn: ({ path, body }: { path: string; body: object }) =>
      apiFetch<{ item: InventoryItem }>(path, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: ({ item: saved }) => {
      setItem(saved);
      setStatus(saved.status);
      setQuantity(String(saved.quantity));
      setMessage(`Updated ${saved.inventoryNo}.`);
      void queryClient.invalidateQueries({ queryKey: ["stock-verification"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  function onLookup(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setItem(null);
    lookup.mutate();
  }
  function onSave(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    if (mode === "scan") record.mutate(`/api/inventory/${item.id}/verify`);
    if (mode === "status")
      update.mutate({ path: `/api/inventory/${item.id}/stock-status`, body: { status } });
    if (mode === "quantity")
      update.mutate({
        path: `/api/inventory/${item.id}/stock-quantity`,
        body: { quantity: Number(quantity) },
      });
  }
  const busy = lookup.isPending || record.isPending || update.isPending;
  const label =
    mode === "scan" ? "Record scan" : mode === "status" ? "Save status" : "Save quantity";
  return (
    <div className="space-y-5">
      <form className="flex flex-wrap items-end gap-3" onSubmit={onLookup}>
        <div className="space-y-2">
          <Label htmlFor={`stock-${mode}`}>Inventory no.</Label>
          <Input
            id={`stock-${mode}`}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            className="w-56"
            autoComplete="off"
            required
          />
        </div>
        <Button type="submit" className="rounded-full" disabled={busy}>
          {lookup.isPending ? "Looking…" : "Get"}
        </Button>
      </form>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {item ? (
        <form
          className="max-w-lg space-y-4 rounded-2xl border border-border bg-card p-4"
          onSubmit={onSave}
        >
          <ItemSummary item={item} />
          {mode === "status" ? (
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {mode === "quantity" ? (
            <div className="space-y-2">
              <Label htmlFor="verified-quantity">Quantity found</Label>
              <Input
                id="verified-quantity"
                type="number"
                min="0"
                step={item.unit === "NO" ? "1" : "0.001"}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </div>
          ) : null}
          <Button type="submit" className="rounded-full" disabled={busy}>
            {record.isPending || update.isPending ? "Saving…" : label}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function VerificationList({ view }: { view: "verified" | "shortage" }) {
  const rows = useQuery({
    queryKey: ["stock-verification", view],
    queryFn: () => apiFetch<{ items: InventoryItem[] }>(`/api/inventory/verification?view=${view}`),
  });
  const heading = view === "verified" ? "Stock verified list" : "Stock shortage list";
  if (rows.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (rows.error instanceof Error)
    return <p className="text-sm text-destructive">{rows.error.message}</p>;
  const items = rows.data?.items ?? [];
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{heading}</h2>
        <p className="text-sm text-muted-foreground">
          {view === "verified"
            ? "Numbers recorded during a shelf count."
            : "Available numbers not yet recorded during a shelf count."}
        </p>
      </div>
      {items.length > 0 ? (
        <ExportExcelButton
          filename={view === "verified" ? "stock-verified" : "stock-shortage"}
          load={async () => [
            {
              name: heading,
              columns: [
                "Inventory no.",
                "Code",
                "Product",
                "Group",
                "Quantity",
                "Unit",
                "Status",
                ...(view === "verified" ? ["Verified at"] : []),
              ],
              rows: items.map((item) => [
                item.inventoryNo,
                item.productCode,
                item.productName,
                item.groupName,
                item.quantity,
                item.unit,
                item.status,
                ...(view === "verified" ? [item.verifiedAt ?? ""] : []),
              ]),
            },
          ]}
        />
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Inventory no.</TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Status</TableHead>
              {view === "verified" ? <TableHead>Verified</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={view === "verified" ? 5 : 4} className="text-muted-foreground">
                  No rows.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.inventoryNo}</TableCell>
                  <TableCell>
                    {item.productCode} · {item.productName}
                  </TableCell>
                  <TableCell>
                    {formatQty(item.quantity)} {unitLabel(item.unit)}
                  </TableCell>
                  <TableCell className="capitalize">{item.status}</TableCell>
                  {view === "verified" ? (
                    <TableCell>
                      {item.verifiedAt
                        ? new Intl.DateTimeFormat("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(item.verifiedAt))
                        : "—"}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ItemSummary({ item }: { item: InventoryItem }) {
  return (
    <div>
      <p className="font-mono text-sm font-medium">{item.inventoryNo}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.productCode} · {item.groupName} · {item.productName}
      </p>
      <p className="mt-3 text-sm">
        {unitLabel(item.unit)} · {formatRupees(item.price)} · qty {formatQty(item.quantity)} ·{" "}
        <span className="capitalize">{item.status}</span>
      </p>
    </div>
  );
}
function formatQty(value: number): string {
  return String(value);
}
