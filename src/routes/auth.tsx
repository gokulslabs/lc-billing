import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { signInEmail } from "@/lib/auth-id";
import { Logo } from "@/components/app/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff sign in — Ladies Collections" },
      { name: "description", content: "Sign in to the Ladies Collections boutique manager." },
      { property: "og:title", content: "Staff sign in — Ladies Collections" },
      { property: "og:description", content: "Sign in to the Ladies Collections boutique manager." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: signInEmail(email), password });
        if (error) toast.error("Email, mobile, or password is incorrect.");
        else navigate({ to: "/dashboard", replace: true });
      } else if (!email.includes("@") || signInEmail(email).endsWith("@staff.ladiescollections.local")) {
        toast.error("A mobile login has no inbox. Ask the owner for the password.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(signInEmail(email), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) toast.error(error.message);
        else setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signin" ? "Welcome back" : "Reset password";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[image:var(--gradient-soft)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="rounded-3xl border border-border bg-card p-8 shadow-[var(--shadow-soft)]">
          {sent ? (
            <div className="text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary" />
              <h1 className="mt-4 text-3xl font-semibold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">We sent a link to set a new password.</p>
              <Button
                variant="ghost"
                className="mt-6"
                onClick={() => {
                  setSent(false);
                  setMode("signin");
                }}
              >
                Back to sign in
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-center text-3xl font-semibold">{title}</h1>
              <p className="mt-1 text-center text-sm text-muted-foreground">
                {mode === "forgot"
                  ? "Enter the email on the account. A mobile number has no inbox."
                  : "Sign in with your email or mobile number."}
              </p>
              <form onSubmit={onSubmit} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email or mobile</Label>
                  <Input
                    id="email"
                    type="text"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
                <Button type="submit" className="w-full rounded-full" disabled={busy}>
                  {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}
                </Button>
              </form>
              {mode === "forgot" ? (
                <div className="mt-6 text-center text-sm text-muted-foreground">
                  <button onClick={() => setMode("signin")} className="text-primary hover:underline">
                    Back to sign in
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
