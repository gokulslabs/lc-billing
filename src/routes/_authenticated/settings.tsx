import { useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import type { StitchingGarment, StitchingProcess } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Ladies Collections" },
      { name: "description", content: "Stitching garments, measurement heads, and processes for Ladies Collections." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<{ garments: StitchingGarment[]; processes: StitchingProcess[] }>("/api/settings"),
  });
  const garments = settings.data?.garments ?? [];
  const processes = settings.data?.processes ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-10">
      <div>
        <h1 className="text-4xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Stitching garments, the measurement heads for each garment, and the process list. Names can be added or removed.
        </p>
      </div>
      {settings.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {settings.error instanceof Error ? <p className="text-sm text-destructive">{settings.error.message}</p> : null}
      {settings.data ? (
        <Tabs defaultValue="products">
          <TabsList>
            <TabsTrigger value="products">Stitching products</TabsTrigger>
            <TabsTrigger value="measurements">Measurements</TabsTrigger>
            <TabsTrigger value="processes">Processes</TabsTrigger>
          </TabsList>
          <TabsContent value="products" className="mt-6">
            <Garments garments={garments} />
          </TabsContent>
          <TabsContent value="measurements" className="mt-6">
            <Measurements garments={garments} />
          </TabsContent>
          <TabsContent value="processes" className="mt-6">
            <Processes processes={processes} />
          </TabsContent>
        </Tabs>
      ) : null}
    </div>
  );
}

function Garments({ garments }: { garments: StitchingGarment[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => apiFetch("/api/settings/garments", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: async () => {
      setName("");
      toast.success("Garment added.");
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/settings/garments/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Garment removed.");
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-6">
      <NameForm
        id="garment-name"
        label="Product name"
        value={name}
        onChange={setName}
        pending={add.isPending}
        action="Save"
        onSubmit={() => add.mutate()}
      />
      <NameTable
        heading="Product name"
        rows={garments.map((garment) => ({ id: garment.id, name: garment.name }))}
        onRemove={(row) => {
          if (!window.confirm(`Remove ${row.name}? Its measurement heads are removed with it. This cannot be undone.`)) return;
          remove.mutate(row.id);
        }}
      />
    </section>
  );
}

function Measurements({ garments }: { garments: StitchingGarment[] }) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState(garments[0]?.id ?? "");
  const [label, setLabel] = useState("");
  const garment = garments.find((item) => item.id === productId) ?? garments[0];
  const add = useMutation({
    mutationFn: () =>
      apiFetch("/api/settings/measurements", {
        method: "POST",
        body: JSON.stringify({ productId: garment?.id, label }),
      }),
    onSuccess: async () => {
      setLabel("");
      toast.success("Measurement head added.");
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/settings/measurements/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Measurement head removed.");
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="measurement-garment">Product name</Label>
        <Select value={garment?.id} onValueChange={setProductId}>
          <SelectTrigger id="measurement-garment" className="w-full max-w-xs">
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            {garments.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {garment ? (
        <>
          <NameTable
            heading="Measurement head"
            rows={garment.measurements.map((field) => ({ id: field.id, name: field.label }))}
            onRemove={(row) => {
              if (!window.confirm(`Remove ${row.name} from ${garment.name}? Saved orders keep the measurements already written on them. This cannot be undone.`)) {
                return;
              }
              remove.mutate(row.id);
            }}
          />
          <NameForm
            id="measurement-head"
            label="Measurement head"
            value={label}
            onChange={setLabel}
            pending={add.isPending}
            action="Add"
            onSubmit={() => add.mutate()}
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Add a garment first.</p>
      )}
    </section>
  );
}

function Processes({ processes }: { processes: StitchingProcess[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () => apiFetch("/api/settings/processes", { method: "POST", body: JSON.stringify({ name }) }),
    onSuccess: async () => {
      setName("");
      toast.success("Process added.");
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/settings/processes/${id}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.success("Process removed.");
      await refresh(queryClient);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="space-y-6">
      <NameTable
        heading="Process"
        rows={processes.map((process) => ({ id: process.id, name: process.name }))}
        onRemove={(row) => {
          if (!window.confirm(`Remove ${row.name}? This cannot be undone.`)) return;
          remove.mutate(row.id);
        }}
      />
      <NameForm
        id="process-name"
        label="Process"
        value={name}
        onChange={setName}
        pending={add.isPending}
        action="Add"
        onSubmit={() => add.mutate()}
      />
    </section>
  );
}

function NameForm({
  id,
  label,
  value,
  onChange,
  pending,
  action,
  onSubmit,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  pending: boolean;
  action: string;
  onSubmit: () => void;
}) {
  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} maxLength={40} className="w-72" required />
      </div>
      <Button type="submit" className="rounded-full" disabled={pending}>
        {pending ? "Saving…" : action}
      </Button>
    </form>
  );
}

function NameTable({
  heading,
  rows,
  onRemove,
}: {
  heading: string;
  rows: { id: string; name: string }[];
  onRemove: (row: { id: string; name: string }) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Sl.no.</TableHead>
            <TableHead>{heading}</TableHead>
            <TableHead className="w-28 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={row.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-right">
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={() => onRemove(row)}>
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                None yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

async function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  await queryClient.invalidateQueries({ queryKey: ["settings"] });
  await queryClient.invalidateQueries({ queryKey: ["stitching-products"] });
}
