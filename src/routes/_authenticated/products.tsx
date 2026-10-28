import { useDeferredValue, useState, type ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import {
  UNITS,
  formatRupees,
  unitLabel,
  type Product,
  type ProductGroup,
  type Unit,
} from "@/lib/products";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products — Ladies Collections" },
      { name: "description", content: "Product groups, prices and discounts for Ladies Collections." },
    ],
  }),
  component: ProductsPage,
});

function ProductsPage() {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const [groupId, setGroupId] = useState("");
  const [page, setPage] = useState(1);
  const groups = useQuery({
    queryKey: ["product-groups"],
    queryFn: () => apiFetch<{ groups: ProductGroup[] }>("/api/product-groups"),
  });
  const products = useQuery({
    queryKey: ["products", deferred, groupId, page],
    queryFn: () => {
      const params = new URLSearchParams();
      if (deferred.trim()) params.set("q", deferred.trim());
      if (groupId) params.set("groupId", groupId);
      params.set("page", String(page));
      return apiFetch<{ products: Product[]; total: number }>(`/api/products?${params.toString()}`);
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6 md:p-10">
      <div>
        <h1 className="text-4xl font-semibold">Products</h1>
        <p className="mt-2 text-sm text-muted-foreground">Groups, prices, and the discount for each group.</p>
      </div>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>
        <TabsContent value="products" className="space-y-4">
          <ProductPanel
            groups={groups.data?.groups ?? []}
            products={products.data?.products ?? []}
            total={products.data?.total ?? 0}
            page={page}
            loading={products.isLoading}
            error={products.error instanceof Error ? products.error.message : null}
            q={q}
            groupId={groupId}
            onQ={(value) => {
              setQ(value);
              setPage(1);
            }}
            onGroup={(value) => {
              setGroupId(value);
              setPage(1);
            }}
            onPage={setPage}
          />
        </TabsContent>
        <TabsContent value="groups">
          <GroupPanel
            groups={groups.data?.groups ?? []}
            loading={groups.isLoading}
            error={groups.error instanceof Error ? groups.error.message : null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProductPanel({
  groups,
  products,
  total,
  page,
  loading,
  error,
  q,
  groupId,
  onQ,
  onGroup,
  onPage,
}: {
  groups: ProductGroup[];
  products: Product[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  q: string;
  groupId: string;
  onQ: (value: string) => void;
  onGroup: (value: string) => void;
  onPage: (page: number) => void;
}) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<Product | "new" | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Input
            value={q}
            onChange={(event) => onQ(event.target.value)}
            placeholder="Search name or code"
            className="w-56"
          />
          <Select value={groupId || "all"} onValueChange={(value) => onGroup(value === "all" ? "" : value)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportExcelButton
            filename="products"
            load={async () => {
              const params = new URLSearchParams({ picker: "1" });
              if (q.trim()) params.set("q", q.trim());
              if (groupId) params.set("groupId", groupId);
              const data = await apiFetch<{ products: Product[] }>(`/api/products?${params.toString()}`);
              return [
                {
                  name: "Products",
                  columns: ["Code", "Group", "Name", "Unit", "Price", "Group discount %"],
                  rows: data.products.map((product) => [product.code, product.groupName, product.name, product.unit, product.price, product.discountPercent]),
                },
              ];
            }}
          />
          <Button className="rounded-full" onClick={() => setEditor("new")} disabled={groups.length === 0}>
            Add product
          </Button>
        </div>
      </div>
      {groups.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">Add a product group first. Sarees, blouse, fabrics and the rest live there.</p>
      ) : null}
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && !error && products.length === 0 ? (
        <p className="text-sm text-muted-foreground">No products yet.</p>
      ) : null}
      {products.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="whitespace-nowrap font-mono text-sm">{product.code}</TableCell>
                  <TableCell>{product.name}</TableCell>
                  <TableCell>{product.groupName}</TableCell>
                  <TableCell>{unitLabel(product.unit)}</TableCell>
                  <TableCell>{formatRupees(product.price)}</TableCell>
                  <TableCell>{product.discountPercent}%</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditor(product)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        if (!window.confirm(`Remove ${product.name || "this product"}? This cannot be undone.`)) return;
                        void apiFetch(`/api/products/${product.id}`, { method: "DELETE" })
                          .then(() => queryClient.invalidateQueries({ queryKey: ["products"] }))
                          .then(() => queryClient.invalidateQueries({ queryKey: ["product-groups"] }))
                          .catch((reason: Error) => toast.error(reason.message));
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <ListFooter page={page} total={total} shown={products.length} onPage={onPage} />
      <ProductDialog
        open={editor !== null}
        product={editor === "new" ? null : editor}
        groups={groups}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSaved={() => {
          setEditor(null);
          void queryClient.invalidateQueries({ queryKey: ["products"] });
          void queryClient.invalidateQueries({ queryKey: ["product-groups"] });
        }}
      />
    </>
  );
}

function GroupPanel({ groups, loading, error }: { groups: ProductGroup[]; loading: boolean; error: string | null }) {
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<ProductGroup | "new" | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <ExportExcelButton
          filename="product-groups"
          load={async () => [
            {
              name: "Groups",
              columns: ["Group", "Code", "Discount %", "Products"],
              rows: groups.map((group) => [group.name, group.code, group.discountPercent, group.productCount]),
            },
          ]}
        />
        <Button className="rounded-full" onClick={() => setEditor("new")}>
          Add group
        </Button>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!loading && groups.length === 0 ? <p className="text-sm text-muted-foreground">No groups yet.</p> : null}
      {groups.length > 0 ? (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{group.code}</TableCell>
                  <TableCell>{group.discountPercent}%</TableCell>
                  <TableCell>{group.productCount}</TableCell>
                  <TableCell className="space-x-2 text-right">
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditor(group)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        if (!window.confirm(`Remove ${group.name}? This cannot be undone.`)) return;
                        void apiFetch(`/api/product-groups/${group.id}`, { method: "DELETE" })
                          .then(() => queryClient.invalidateQueries({ queryKey: ["product-groups"] }))
                          .catch((reason: Error) => toast.error(reason.message));
                      }}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      <GroupDialog
        open={editor !== null}
        group={editor === "new" ? null : editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSaved={() => {
          setEditor(null);
          void queryClient.invalidateQueries({ queryKey: ["product-groups"] });
        }}
      />
    </div>
  );
}

function ProductDialog({
  open,
  product,
  groups,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  product: Product | null;
  groups: ProductGroup[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [groupId, setGroupId] = useState(product?.groupId ?? groups[0]?.id ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [unit, setUnit] = useState<Unit>(product?.unit ?? "NO");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [seen, setSeen] = useState<string | null>(null);
  const mode = open ? (product?.id ?? "new") : null;
  if (mode && seen !== mode) {
    setSeen(mode);
    setGroupId(product?.groupId ?? groups[0]?.id ?? "");
    setName(product?.name ?? "");
    setCode(product?.code ?? "");
    setUnit(product?.unit ?? "NO");
    setPrice(product ? String(product.price) : "");
  }

  const save = useMutation({
    mutationFn: async () => {
      const amount = Number(price);
      if (!groupId) throw new Error("Choose a product group.");
      if (!Number.isFinite(amount)) throw new Error("Enter a price.");
      const body = { groupId, name, code, unit, price: amount };
      if (product) {
        await apiFetch(`/api/products/${product.id}`, { method: "PATCH", body: JSON.stringify(body) });
        return;
      }
      await apiFetch("/api/products", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success(product ? "Product updated." : "Product added.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {product ? "Update the price, unit or group." : "Leave the code blank and the next code for that group is used."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Group" id="product-group">
            <Select value={groupId || undefined} onValueChange={setGroupId}>
              <SelectTrigger id="product-group">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name} ({group.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Name" id="product-name">
            <Input id="product-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </Field>
          <Field label="Code" id="product-code">
            <Input id="product-code" value={code} onChange={(event) => setCode(event.target.value)} maxLength={40} />
          </Field>
          <Field label="Unit" id="product-unit">
            <Select value={unit} onValueChange={(value) => setUnit(value as Unit)}>
              <SelectTrigger id="product-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {unitLabel(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Price" id="product-price">
            <Input
              id="product-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : product ? "Save" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GroupDialog({
  open,
  group,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  group: ProductGroup | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [code, setCode] = useState(group?.code ?? "");
  const [discount, setDiscount] = useState(group ? String(group.discountPercent) : "0");
  const [seen, setSeen] = useState<string | null>(null);
  const mode = open ? (group?.id ?? "new") : null;
  if (mode && seen !== mode) {
    setSeen(mode);
    setName(group?.name ?? "");
    setCode(group?.code ?? "");
    setDiscount(group ? String(group.discountPercent) : "0");
  }

  const save = useMutation({
    mutationFn: async () => {
      const discountPercent = Number(discount);
      if (!Number.isFinite(discountPercent)) throw new Error("Enter a discount.");
      const body = { name, code, discountPercent };
      if (group) {
        await apiFetch(`/api/product-groups/${group.id}`, { method: "PATCH", body: JSON.stringify(body) });
        return;
      }
      await apiFetch("/api/product-groups", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      toast.success(group ? "Group updated." : "Group added.");
      onSaved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Edit group" : "Add group"}</DialogTitle>
          <DialogDescription>The code prefixes new product codes. Discount applies to the whole group.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Name" id="group-name">
            <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          </Field>
          <Field label="Code" id="group-code">
            <Input id="group-code" value={code} onChange={(event) => setCode(event.target.value)} required maxLength={12} />
          </Field>
          <Field label="Discount %" id="group-discount">
            <Input
              id="group-discount"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              required
            />
          </Field>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : group ? "Save" : "Add group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
