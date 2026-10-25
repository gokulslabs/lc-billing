import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { passwordProblem } from "@/lib/password";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Ladies Collections" },
      { name: "description", content: "Choose a new password for your Ladies Collections account." },
      { property: "og:title", content: "Set a new password — Ladies Collections" },
      { property: "og:description", content: "Choose a new password for your Ladies Collections account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const problem = passwordProblem(password, user?.email ?? "");
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated.");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-soft)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-soft)]">
          <h1 className="text-center text-3xl font-semibold">Set a new password</h1>
          {!loading && !user ? (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              This link has expired or was already used. Request a new one from the sign-in page.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  At least 10 characters with letters and numbers. Never a phone number.
                </p>
              </div>
              <Button type="submit" className="w-full rounded-full" disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
