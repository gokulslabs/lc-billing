import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import type { DashboardStats } from "@/lib/dashboard";
import type { AppModule } from "@/lib/modules";
import { formatRupees } from "@/lib/products";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Ladies Collections" },
      { name: "description", content: "Today's sales, stock and customers at a glance." },
      { property: "og:title", content: "Dashboard — Ladies Collections" },
      { property: "og:description", content: "Today's sales, stock and customers at a glance." },
    ],
  }),
  component: Dashboard,
});

const STATS: { key: keyof DashboardStats; label: string; money?: boolean; to?: AppModule["to"] }[] = [
  { key: "salesAmount", label: "Today's sales", money: true, to: "/sales" },
  { key: "salesQuantity", label: "Today's sales quantity", to: "/sales" },
  { key: "collections", label: "Today's collections", money: true, to: "/sales" },
  { key: "bills", label: "Bills today", to: "/sales" },
  { key: "products", label: "Products", to: "/products" },
  { key: "customers", label: "Customers", to: "/customers" },
  { key: "employees", label: "Employees" },
  { key: "openStitching", label: "Open stitching orders", to: "/stitching" },
];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Dashboard() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user!.id).maybeSingle();
      return data;
    },
  });
  const stats = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => apiFetch<{ stats: DashboardStats }>("/api/dashboard"),
  });
  const name = profile?.full_name?.split(" ")[0] ?? "there";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-6 md:p-10">
      <section className="rounded-3xl bg-[image:var(--gradient-primary)] p-8 text-primary-foreground shadow-[var(--shadow-soft)] md:p-10">
        <p className="text-xs uppercase tracking-[0.3em] opacity-90">{today}</p>
        <h1 className="mt-3 text-4xl font-semibold md:text-5xl">
          {greeting()}, {name}
        </h1>
        <p className="mt-2 max-w-lg text-sm opacity-95">
          Today's sales, the quantity sold, and the collections taken in. Collections stay separate from the bill total.
        </p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Today at a glance</h2>
        {stats.error instanceof Error ? <p className="mb-4 text-sm text-destructive">{stats.error.message}</p> : null}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((stat) => {
            const value = stats.data?.stats[stat.key];
            const shown = value == null ? "…" : stat.money ? formatRupees(value) : String(value);
            const body = (
              <>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{shown}</p>
              </>
            );
            return stat.to ? (
              <Link key={stat.key} to={stat.to} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary">
                {body}
              </Link>
            ) : (
              <div key={stat.key} className="rounded-2xl border border-border bg-card p-5">
                {body}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
