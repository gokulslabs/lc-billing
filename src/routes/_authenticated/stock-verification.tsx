import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { apiFetch } from "@/lib/api";
import type { InventoryItem } from "@/lib/inventory";
import { formatRupees, unitLabel } from "@/lib/products";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/stock-verification")({
  head: () => ({
    meta: [
      { title: "Stock verification — Ladies Collections" },
      { name: "description", content: "Scan the shelf, then see what was found and what is short." },
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
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-10">
      <div>
        <h1 className="text-3xl font-semibold md:text-4xl">Stock verification</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Scan a piece on the shelf, then see what was found and what is still short.
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
          <Lookup title="Inventory no." show="piece" />
        </TabsContent>
        <TabsContent value="verified" className="mt-6">
          <EmptyList
            title="Stock verified list"
            note="Nothing has been scanned in a count yet."
            columns={["Inventory no.", "Product", "Quantity", "Status"]}
          />
        </TabsContent>
        <TabsContent value="shortage" className="mt-6">
          <EmptyList
            title="Stock shortage list"
            note="Nothing is marked short. A piece shows here only after a shelf count."
            columns={["Inventory no.", "Product", "Quantity"]}
          />
        </TabsContent>
        <TabsContent value="status" className="mt-6">
          <Lookup title="Inventory no." show="status" />
        </TabsContent>
        <TabsContent value="quantity" className="mt-6">
          <Lookup title="Inventory no." show="quantity" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Lookup({ title, show }: { title: string; show: "piece" | "status" | "quantity" }) {
  const [number, setNumber] = useState("");
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const query = number.trim();
    if (!query) return;
    setBusy(true);
    setMessage("");
    setItem(null);
    try {
      const data = await apiFetch<{ items: InventoryItem[] }>(`/api/inventory?q=${encodeURIComponent(query)}`);
      const match = data.items.find((row) => row.inventoryNo.toUpperCase() === query.toUpperCase()) ?? null;
      setItem(match);
      if (!match) setMessage("That inventory number is not on the stock list.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not look up that number.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => void onSubmit(event)}>
        <div className="space-y-2">
          <Label htmlFor={`stock-${show}`}>{title}</Label>
          <Input
            id={`stock-${show}`}
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            className="w-56"
            autoComplete="off"
            required
          />
        </div>
        <Button type="submit" className="rounded-full" disabled={busy}>
          {busy ? "Looking…" : "Get"}
        </Button>
      </form>
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      {item ? <Found item={item} show={show} /> : null}
    </div>
  );
}

function Found({ item, show }: { item: InventoryItem; show: "piece" | "status" | "quantity" }) {
  return (
    <article className="max-w-lg rounded-2xl border border-border bg-card p-4">
      <p className="font-mono text-sm font-medium">{item.inventoryNo}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {item.productCode} · {item.groupName} · {item.productName}
      </p>
      {show === "piece" ? (
        <p className="mt-3 text-sm">
          {unitLabel(item.unit)} · {formatRupees(item.price)} · qty {formatQty(item.quantity)} · {item.status}
        </p>
      ) : null}
      {show === "status" ? <p className="mt-3 text-sm capitalize">Status: {item.status}</p> : null}
      {show === "quantity" ? <p className="mt-3 text-sm">Quantity: {formatQty(item.quantity)}</p> : null}
    </article>
  );
}

function EmptyList({ title, note, columns }: { title: string; note: string; columns: string[] }) {
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{note}</p>
      <div className="rounded-2xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column}>{column}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={columns.length} className="text-muted-foreground">
                No rows.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatQty(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}
