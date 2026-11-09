import { useRef, type CSSProperties } from "react";
import { createFileRoute, Link, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { BackButton } from "@/components/app/BackButton";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, LogOut, Tag, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { clearActivity, idleWarningText } from "@/lib/idle";
import { MODULES } from "@/lib/modules";
import { ExportExcelButton } from "@/components/app/ExportExcelButton";
import { Logo } from "@/components/app/Logo";
import { ThemeToggle } from "@/components/app/ThemeToggle";
import { loadMasterExport } from "@/lib/master-export";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signingOut = useRef(false);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      return data;
    },
  });
  const { data: roles, isLoading } = useQuery({
    queryKey: ["my-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const userId = user?.id;
      if (!userId) return [];
      const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      if (error) throw error;
      return data.map((r) => r.role);
    },
  });

  async function signOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    clearActivity();
    await queryClient.cancelQueries();
    queryClient.clear();
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch {
      await supabase.auth.signOut({ scope: "local" });
    }
    navigate({ to: "/auth", replace: true });
  }

  const idle = useIdleLogout(Boolean(user), signOut);

  if (isLoading || !user) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  const idleWarning = idle.warning ? <IdleWarning unsaved={idle.unsaved} onStay={idle.stay} /> : null;

  if (!roles || roles.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-soft)] px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-[var(--shadow-soft)]">
          <div className="mb-6 flex justify-center">
            <Logo />
          </div>
          <h1 className="text-3xl font-semibold">Waiting for access</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account ({user.email}) is created. The shop owner needs to give you access before you can open the app.
          </p>
          <Button variant="outline" className="mt-6 rounded-full" onClick={signOut}>
            Sign out
          </Button>
        </div>
        {idleWarning}
      </main>
    );
  }

  const isAdmin = roles.includes("admin");

  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width-icon": "4.25rem" } as CSSProperties}>
      {idleWarning}
      <Sidebar collapsible="icon" className="print:hidden">
        <SidebarHeader className="flex-row items-center gap-2 px-4 py-5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
          <div className="min-w-0 group-data-[collapsible=icon]:[&_.leading-none]:hidden group-data-[collapsible=icon]:[&_.rounded-full]:h-8 group-data-[collapsible=icon]:[&_.rounded-full]:w-8">
            <Logo />
          </div>
          <SidebarTrigger className="ml-auto shrink-0 group-data-[collapsible=icon]:ml-0" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="flex flex-1 flex-col">
            <SidebarGroupContent className="flex flex-1 flex-col">
              <SidebarMenu className="flex-1 justify-between py-2">
                {MODULES.filter((m) => m.key !== "employees" || isAdmin).map((m) => (
                  <SidebarMenuItem key={m.key} className="flex flex-1 items-center group-data-[collapsible=icon]:justify-center">
                    {m.to ? (
                      <SidebarMenuButton asChild size="lg" tooltip={m.label} className="h-full min-h-11 rounded-xl px-3 text-base [&>svg]:size-5 group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-2 group-data-[collapsible=icon]:[&>span]:hidden">
                        <Link to={m.to} activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}>
                          <m.icon />
                          <span>{m.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton disabled size="lg" tooltip={m.label} className="h-full min-h-11 rounded-xl px-3 text-base opacity-60 [&>svg]:size-5 group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-2 group-data-[collapsible=icon]:[&>span]:hidden">
                        <m.icon />
                        <span>{m.label}</span>
                        <Badge variant="secondary" className="ml-auto text-[10px] group-data-[collapsible=icon]:hidden">
                          Soon
                        </Badge>
                      </SidebarMenuButton>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2">
          <div className="mb-2 min-w-0 group-data-[collapsible=icon]:hidden">
            <div className="truncate text-sm font-medium" title={user.email ?? undefined}>
              {profile?.full_name?.trim() || "Staff"}
            </div>
            <div className="text-xs capitalize text-muted-foreground">{isAdmin ? "Admin" : "Staff"}</div>
          </div>
          <ExportExcelButton filename="ladies-collections" label="Export all data" className="mb-2 w-full group-data-[collapsible=icon]:hidden" load={loadMasterExport} />
          <ThemeToggle className="mb-2" />
          <Button variant="outline" size="sm" className="w-full rounded-full group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:px-0" title="Sign out" onClick={signOut}>
            <LogOut className="h-4 w-4 group-data-[collapsible=icon]:mr-0 mr-2" />
            <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
          </Button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
        <header className="flex h-14 items-center gap-2 border-b border-border px-4 print:hidden md:hidden">
          <span className="font-display text-lg font-semibold">Ladies Collections</span>
          <ThemeToggle iconOnly className="ml-auto" />
          <SidebarTrigger />
        </header>
        {pathname.replace(/\/$/, "") !== "/dashboard" ? (
          <div className="flex justify-end px-4 pt-4 print:hidden md:px-10">
            <BackButton />
          </div>
        ) : null}
        <Outlet />
        <PhoneBar />
      </SidebarInset>
    </SidebarProvider>
  );
}

const PHONE_LINKS = [
  { to: "/products" as const, label: "Products", icon: Tag },
  { to: "/customers" as const, label: "Customers", icon: Users },
  { to: "/inventory" as const, label: "Inventory", icon: Boxes },
];

function PhoneBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] print:hidden md:hidden">
      <div className="grid grid-cols-3">
        {PHONE_LINKS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="flex flex-col items-center gap-1 px-2 py-2 text-xs text-muted-foreground"
            activeProps={{ className: "flex flex-col items-center gap-1 px-2 py-2 text-xs font-medium text-primary" }}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function IdleWarning({ unsaved, onStay }: { unsaved: boolean; onStay: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-labelledby="idle-warning-title"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)] print:hidden"
    >
      <p id="idle-warning-title" className="text-sm font-medium">
        {idleWarningText(unsaved)}
      </p>
      <Button type="button" className="mt-3 rounded-full" onClick={onStay}>
        Stay logged in
      </Button>
    </div>
  );
}
