import { useDeferredValue, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { Customer } from "@/lib/customers";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
import { PrintTableButton } from "@/components/app/PrintTableButton";
import { ListFooter } from "@/components/app/ListFooter";
import { DeskTable, PhoneCard, PhoneCards } from "@/components/app/PhoneList";
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

export const Route = createFileRoute("/_authenticated/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — Ladies Collections" },
      {
        name: "description",
        content: "Customer names, phones and book numbers for Ladies Collections.",
      },
    ],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "name",
    direction: "asc",
  });
  const columns = [
    { id: "name", label: "Name" },
    { id: "phone", label: "Phone" },
    { id: "book_no", label: "Book no." },
    { id: "address", label: "Address" },
  ];
  const [editor, setEditor] = useState<Customer | "new" | null>(null);
  function listParams() {
    const params = new URLSearchParams({ sort: sort.column, dir: sort.direction });
    if (deferred.trim()) params.set("q", deferred.trim());
    if (filter === "not-recorded") params.set("filter", filter);
    return params;
  }
  const customers = useQuery({
    queryKey: ["customers", deferred, page, sort, filter],
    queryFn: () => {
      const params = listParams();
      params.set("page", String(page));
      return apiFetch<{ customers: Customer[]; total: number }>(
        `/api/customers?${params.toString()}`,
      );
    },
  });
  const rows = customers.data?.customers ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-4 md:p-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">Customers</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Name, address, phone and book number. Open a name to see their bills and stitching.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportExcelButton
            filename="customers"
            load={async () => {
              const params = listParams();
              params.set("export", "1");
              const data = await apiFetch<{ customers: Customer[] }>(
                `/api/customers?${params.toString()}`,
              );
              return [
                {
                  name: "Customers",
                  columns: ["Name", "Phone", "Book no.", "Address"],
                  rows: data.customers.map((customer) => [
                    customer.name,
                    customer.phone ?? "",
                    customer.bookNo ?? "",
                    customer.address ?? "",
                  ]),
                },
              ];
            }}
          />
          <PrintTableButton
            title="CUSTOMERS LIST"
            load={async () => {
              const params = listParams();
              params.set("export", "1");
              const data = await apiFetch<{ customers: Customer[] }>(
                `/api/customers?${params.toString()}`,
              );
              return {
                columns: ["SL.NO.", "NAME", "ADDRESS", "PHONE NO.", "BOOK NO."],
                rows: data.customers.map((customer, index) => [
                  index + 1,
                  customer.name,
                  customer.address ?? "",
                  customer.phone ?? "",
                  customer.bookNo ?? "",
                ]),
              };
            }}
          />
          <Button className="rounded-full" onClick={() => setEditor("new")}>
            Add customer
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
          placeholder="Search name, phone, book number or address"
          className="w-full max-w-sm"
        />
        <Select
          value={filter}
          onValueChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter customers" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All customers</SelectItem>
            <SelectItem value="not-recorded">Not recorded</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {customers.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {customers.error instanceof Error ? (
        <p className="text-sm text-destructive">{customers.error.message}</p>
      ) : null}
      {!customers.isLoading && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customers yet.</p>
      ) : null}
      {rows.length > 0 ? (
        <>
          <PhoneCards>
            {rows.map((customer) => (
              <PhoneCard
                key={customer.id}
                title={
                  <Link
                    to="/customers/$customerId"
                    params={{ customerId: customer.id }}
                    className="hover:underline"
                  >
                    {customer.name}
                  </Link>
                }
                detail={
                  [customer.phone, customer.bookNo, customer.address].filter(Boolean).join(" · ") ||
                  "No phone or address"
                }
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setEditor(customer)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    if (!window.confirm(`Remove ${customer.name}? This cannot be undone.`)) return;
                    void apiFetch(`/api/customers/${customer.id}`, { method: "DELETE" })
                      .then(() => queryClient.invalidateQueries({ queryKey: ["customers"] }))
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
                  {columns.map(({ id, label }) => (
                    <TableHead
                      key={id}
                      aria-sort={
                        sort.column === id
                          ? sort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        className="cursor-pointer hover:underline"
                        onClick={() => {
                          setSort({
                            column: id,
                            direction:
                              sort.column === id && sort.direction === "asc" ? "desc" : "asc",
                          });
                          setPage(1);
                        }}
                      >
                        {label}{" "}
                        <span aria-hidden="true">
                          {sort.column === id ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: customer.id }}
                        className="font-medium hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell>{customer.phone || "—"}</TableCell>
                    <TableCell>{customer.bookNo || "—"}</TableCell>
                    <TableCell className="max-w-xs truncate">{customer.address || "—"}</TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setEditor(customer)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => {
                          if (!window.confirm(`Remove ${customer.name}? This cannot be undone.`))
                            return;
                          void apiFetch(`/api/customers/${customer.id}`, { method: "DELETE" })
                            .then(() => queryClient.invalidateQueries({ queryKey: ["customers"] }))
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
          </DeskTable>
        </>
      ) : null}
      <ListFooter
        page={page}
        total={customers.data?.total ?? 0}
        shown={rows.length}
        onPage={setPage}
      />
      <CustomerDialog
        open={editor !== null}
        customer={editor === "new" ? null : editor}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSaved={() => {
          setEditor(null);
          void queryClient.invalidateQueries({ queryKey: ["customers"] });
        }}
      />
    </div>
  );
}

function CustomerDialog({
  open,
  customer,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(customer?.name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [bookNo, setBookNo] = useState(customer?.bookNo ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [seen, setSeen] = useState<string | null>(null);
  const mode = open ? (customer?.id ?? "new") : null;
  if (mode && seen !== mode) {
    setSeen(mode);
    setName(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setBookNo(customer?.bookNo ?? "");
    setAddress(customer?.address ?? "");
  }

  const save = useMutation({
    mutationFn: (confirmDuplicate: boolean) => {
      const body = JSON.stringify({ name, phone, bookNo, address, confirmDuplicate });
      if (customer) return apiFetch(`/api/customers/${customer.id}`, { method: "PATCH", body });
      return apiFetch("/api/customers", { method: "POST", body });
    },
    onSuccess: () => {
      toast.success(customer ? "Customer updated." : "Customer added.");
      onSaved();
    },
    onError: (error: Error, confirmDuplicate) => {
      if (!confirmDuplicate && error.message.includes("already on another customer")) {
        if (window.confirm(`${error.message}`)) save.mutate(true);
        return;
      }
      toast.error(error.message);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>
            The book number is the one used on the shop counter.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(false);
          }}
        >
          <Field label="Name" id="customer-name">
            <Input
              id="customer-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field label="Phone" id="customer-phone">
            <Input
              id="customer-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              maxLength={20}
            />
          </Field>
          <Field label="Book no." id="customer-book">
            <Input
              id="customer-book"
              value={bookNo}
              onChange={(event) => setBookNo(event.target.value)}
              maxLength={40}
            />
          </Field>
          <Field label="Address" id="customer-address">
            <Input
              id="customer-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              maxLength={300}
            />
          </Field>
          <DialogFooter>
            <Button type="submit" className="rounded-full" disabled={save.isPending}>
              {save.isPending ? "Saving…" : customer ? "Save" : "Add customer"}
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
