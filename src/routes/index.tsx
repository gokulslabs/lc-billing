import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Ladies Collections — Boutique Manager" },
      {
        name: "description",
        content: "Billing, stock, customers and stitching for Ladies Collections, in one secure place.",
      },
      { property: "og:title", content: "Ladies Collections — Boutique Manager" },
      {
        property: "og:description",
        content: "Billing, stock, customers and stitching for Ladies Collections, in one secure place.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[image:var(--gradient-soft)] px-4 text-center">
      <Logo size="lg" />
      <h1 className="mt-10 max-w-xl text-5xl font-semibold leading-tight">
        Your boutique, beautifully organised.
      </h1>
      <p className="mt-4 max-w-md text-muted-foreground">
        Billing, stock, customers and stitching orders in one secure place.
      </p>
      <Button asChild size="lg" className="mt-8 rounded-full px-8">
        {user ? <Link to="/dashboard">Open dashboard</Link> : <Link to="/auth">{loading ? "Staff sign in" : "Staff sign in"}</Link>}
      </Button>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" /> Encrypted connection, personal passwords, role-based access
      </p>
    </main>
  );
}
