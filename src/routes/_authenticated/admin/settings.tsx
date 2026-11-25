import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { appIsInstalled, installHelp, installShopApp, subscribeInstall } from "@/lib/pwa";
import type { StitchingGarment, StitchingProcess } from "@/lib/settings";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Ladies Collections" },
      {
        name: "description",
        content: "Stitching garments, measurement heads, and processes for Ladies Collections.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const admin = useIsAdmin();
  const settings = useQuery({
    queryKey: ["settings"],
    enabled: admin,
    queryFn: () =>
      apiFetch<{ garments: StitchingGarment[]; processes: StitchingProcess[] }>("/api/settings"),
  });
  const garments = settings.data?.garments ?? [];
  const processes = settings.data?.processes ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 md:p-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-4xl font-semibold">Settings</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {admin
              ? "Manage stitching options, staff access, and this device’s app setup."
              : "Install the shop app on this device. Stitching settings can be changed by an admin."}
          </p>
        </div>
        {admin ? (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/admin/employees">
                <Users className="mr-2 h-4 w-4" />
                Employees
              </Link>
            </Button>
            <ExportExcelButton
              filename="settings"
              label="Export settings"
              load={async () => [
                {
                  name: "Garments",
                  columns: ["Garment"],
                  rows: garments.map((garment) => [garment.name]),
                },
                {
                  name: "Measurements",
                  columns: ["Garment", "Field"],
                  rows: garments.flatMap((garment) =>
                    garment.measurements.map((field) => [garment.name, field.label]),
                  ),
                },
                {
                  name: "Processes",
                  columns: ["Process"],
                  rows: processes.map((process) => [process.name]),
                },
              ]}
            />
          </div>
        ) : null}
      </header>
      <InstallApp />
      {settings.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading stitching settings…
        </p>
      ) : null}
      {settings.error instanceof Error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {settings.error.message}
        </p>
      ) : null}
      {admin && settings.data ? (
        <section className="space-y-5 rounded-3xl border border-border bg-card p-4 shadow-sm md:p-6">
          <div>
            <h2 className="text-xl font-semibold">Stitching setup</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Add and maintain the options staff use when recording tailoring orders.
            </p>
          </div>
          <Tabs defaultValue="products">
            <TabsList className="grid h-auto w-full max-w-2xl grid-cols-3">
              <TabsTrigger value="products" className="min-w-0 px-2 py-2.5 text-xs sm:text-sm">
                Garments <span className="ml-1 text-muted-foreground">{garments.length}</span>
              </TabsTrigger>
              <TabsTrigger value="measurements" className="min-w-0 px-2 py-2.5 text-xs sm:text-sm">
                Measurements
              </TabsTrigger>
              <TabsTrigger value="processes" className="min-w-0 px-2 py-2.5 text-xs sm:text-sm">
                Processes <span className="ml-1 text-muted-foreground">{processes.length}</span>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="products" className="mt-5 space-y-5">
              <Garments garments={garments} />
            </TabsContent>
            <TabsContent value="measurements" className="mt-5">
              <Measurements garments={garments} />
            </TabsContent>
            <TabsContent value="processes" className="mt-5">
              <Processes processes={processes} />
            </TabsContent>
          </Tabs>
        </section>
      ) : null}
    </div>
  );
}

function InstallApp() {
  const [installed, setInstalled] = useState(false);
  const [help, setHelp] = useState("");

  useEffect(() => {
    const sync = () => setInstalled(appIsInstalled());
    sync();
    return subscribeInstall(sync);
  }, []);

  async function install() {
    setHelp("");
    const outcome = await installShopApp();
    if (outcome === "accepted") {
      toast.success("Ladies Collections is on the home screen.");
      return;
    }
    if (outcome === "unavailable") setHelp(installHelp());
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between md:p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-background p-2.5 text-primary">
          <Smartphone className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="font-semibold">Install on this device</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add Products, Customers, and Inventory to this device’s home screen.
          </p>
          {help ? <p className="mt-2 text-sm text-muted-foreground">{help}</p> : null}
        </div>
      </div>
      <Button
        type="button"
        variant={installed ? "secondary" : "outline"}
        className="shrink-0 rounded-full"
        disabled={installed}
        onClick={() => void install()}
      >
        {installed ? "Installed" : "Install app"}
      </Button>
    </section>
  );
}

function Garments({ garments }: { garments: StitchingGarment[] }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const add = useMutation({
    mutationFn: () =>
      apiFetch("/api/settings/garments", { method: "POST", body: JSON.stringify({ name }) }),
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
    <section className="space-y-5">
      <NameForm
        id="garment-name"
        label="Add a garment"
        value={name}
        onChange={setName}
        pending={add.isPending}
        action="Add garment"
        onSubmit={() => add.mutate()}
      />
      <NameTable
        heading={`Garments (${garments.length})`}
        emptyMessage="No garments yet. Add the first garment above."
        sortable
        rows={garments.map((garment) => ({ id: garment.id, name: garment.name }))}
        onRemove={(row) => {
          if (
            !window.confirm(
              `Remove ${row.name}? Its measurement heads are removed with it. This cannot be undone.`,
            )
          )
            return;
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
    <section className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="measurement-garment">Choose a garment</Label>
        <Select {...(garment?.id ? { value: garment.id } : {})} onValueChange={setProductId}>
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
          <NameForm
            id="measurement-head"
            label={`Add a measurement for ${garment.name}`}
            value={label}
            onChange={setLabel}
            pending={add.isPending}
            action="Add measurement"
            onSubmit={() => add.mutate()}
          />
          <NameTable
            heading={`Measurements for ${garment.name} (${garment.measurements.length})`}
            emptyMessage="No measurements are set up for this garment yet."
            rows={garment.measurements.map((field) => ({ id: field.id, name: field.label }))}
            onRemove={(row) => {
              if (
                !window.confirm(
                  `Remove ${row.name} from ${garment.name}? Saved orders keep the measurements already written on them. This cannot be undone.`,
                )
              ) {
                return;
              }
              remove.mutate(row.id);
            }}
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
    mutationFn: () =>
      apiFetch("/api/settings/processes", { method: "POST", body: JSON.stringify({ name }) }),
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
    <section className="space-y-5">
      <NameForm
        id="process-name"
        label="Add a process"
        value={name}
        onChange={setName}
        pending={add.isPending}
        action="Add process"
        onSubmit={() => add.mutate()}
      />
      <NameTable
        heading={`Processes (${processes.length})`}
        emptyMessage="No processes yet. Add the first process above."
        rows={processes.map((process) => ({ id: process.id, name: process.name }))}
        onRemove={(row) => {
          if (!window.confirm(`Remove ${row.name}? This cannot be undone.`)) return;
          remove.mutate(row.id);
        }}
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
    <form
      className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-end"
      onSubmit={submit}
    >
      <div className="w-full max-w-md flex-1 space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={40}
          className="w-full"
          placeholder="Type a name"
          required
        />
      </div>
      <Button type="submit" className="w-full rounded-full sm:w-auto" disabled={pending}>
        {pending ? "Saving…" : action}
      </Button>
    </form>
  );
}

function NameTable({
  heading,
  rows,
  onRemove,
  sortable = false,
  emptyMessage = "No items added yet.",
}: {
  heading: string;
  rows: { id: string; name: string }[];
  onRemove: (row: { id: string; name: string }) => void;
  sortable?: boolean;
  emptyMessage?: string;
}) {
  const [direction, setDirection] = useState<"ascending" | "descending">();
  const ordered = direction
    ? [...rows].sort((a, b) => (direction === "ascending" ? 1 : -1) * a.name.localeCompare(b.name))
    : rows;
  return (
    <div className="rounded-2xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Sl.no.</TableHead>
            <TableHead aria-sort={direction}>
              {sortable ? (
                <button
                  type="button"
                  className="cursor-pointer hover:underline"
                  onClick={() =>
                    setDirection((current) =>
                      current === "ascending" ? "descending" : "ascending",
                    )
                  }
                >
                  {heading}{" "}
                  <span aria-hidden="true">
                    {direction === "ascending" ? "↑" : direction === "descending" ? "↓" : "↕"}
                  </span>
                </button>
              ) : (
                heading
              )}
            </TableHead>
            <TableHead className="w-28 text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordered.map((row, index) => (
            <TableRow key={row.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => onRemove(row)}
                >
                  Remove
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-muted-foreground">
                {emptyMessage}
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
