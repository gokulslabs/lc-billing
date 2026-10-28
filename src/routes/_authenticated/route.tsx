import { useRef } from "react";
import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIdleLogout } from "@/hooks/use-idle-logout";
import { clearActivity, idleWarningText } from "@/lib/idle";
import { MODULES } from "@/lib/modules";
import { Logo } from "@/components/app/Logo";
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
    <SidebarProvider>
      {idleWarning}
      <Sidebar className="print:hidden">
        <SidebarHeader className="px-4 py-5">
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup className="flex flex-1 flex-col">
            <SidebarGroupContent className="flex flex-1 flex-col">
              <SidebarMenu className="flex-1 justify-between py-2">
                {MODULES.filter((m) => m.key !== "employees" || isAdmin).map((m) => (
                  <SidebarMenuItem key={m.key} className="flex flex-1 items-center">
                    {m.to ? (
                      <SidebarMenuButton asChild size="lg" className="h-full min-h-11 rounded-xl px-3 text-base [&>svg]:size-5">
                        <Link to={m.to} activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}>
                          <m.icon />
                          <span>{m.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    ) : (
                      <SidebarMenuButton disabled size="lg" className="h-full min-h-11 rounded-xl px-3 text-base opacity-60 [&>svg]:size-5">
                        <m.icon />
                        <span>{m.label}</span>
                        <Badge variant="secondary" className="ml-auto text-[10px]">
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
        <SidebarFooter className="border-t border-sidebar-border p-4">
          <div className="mb-2 min-w-0">
            <div className="truncate text-sm font-medium" title={user.email ?? undefined}>
              {profile?.full_name?.trim() || "Staff"}
            </div>
            <div className="text-xs capitalize text-muted-foreground">{isAdmin ? "Admin" : "Staff"}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full rounded-full" onClick={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b border-border px-4 print:hidden md:hidden">
          <SidebarTrigger />
          <span className="font-display text-lg font-semibold">Ladies Collections</span>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
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
