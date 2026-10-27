import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api";
import type { DashboardStats } from "@/lib/dashboard";
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

const NEEDS: { key: keyof DashboardStats; label: string; detail: string; money?: boolean; href: string }[] = [
  { key: "unpaidBills", label: "This counter, still due", detail: "Bills written here that are not paid", href: "/sales?view=due" },
  { key: "unpaidAmount", label: "This counter, amount due", detail: "From 26 Oct 2026 onward", money: true, href: "/sales?view=due" },
  { key: "oldUnpaidBills", label: "Old bills, payment not written", detail: "Copied balances. They stay unpaid until someone records a payment.", href: "/sales?view=due&books=old" },
  { key: "overdueStitching", label: "Stitching past the date", detail: "Still pending. Statuses were not changed.", href: "/stitching?board=overdue" },
  { key: "readyStitching", label: "Ready for pickup", detail: "Call these customers", href: "/stitching?board=ready" },
  { key: "dueTodayStitching", label: "Stitching due today", detail: "Trials and pending for today", href: "/stitching?board=today" },
];

function CloseFigure({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value == null ? "…" : formatRupees(value)}</p>
    </div>
  );
}

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
        <p className="mt-2 max-w-lg text-sm opacity-95">What needs a person today, then the money that came in.</p>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Needs a person</h2>
        {stats.error instanceof Error ? <p className="mb-4 text-sm text-destructive">{stats.error.message}</p> : null}
        <div className="grid gap-4 md:grid-cols-2">
          {NEEDS.map((item) => {
            const value = stats.data?.stats[item.key];
            const shown = value == null ? "…" : item.money ? formatRupees(value) : String(value);
            return (
              <a key={item.key} href={item.href} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary">
                <p className="text-sm text-muted-foreground">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{shown}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
              </a>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-semibold">Today's close</h2>
        <a href="/sales?view=close" className="grid gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary md:grid-cols-3">
          <CloseFigure label="Billed" value={stats.data?.stats.salesAmount} />
          <CloseFigure label="Collected" value={stats.data?.stats.collections} />
          <CloseFigure label="Still due on today's bills" value={stats.data?.stats.dueOnToday} />
          <CloseFigure label="Cash" value={stats.data?.stats.cash} />
          <CloseFigure label="UPI" value={stats.data?.stats.upi} />
          <CloseFigure label="Card" value={stats.data?.stats.card} />
        </a>
      </section>
    </div>
  );
}
