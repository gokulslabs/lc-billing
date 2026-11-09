import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Flower2, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { passwordProblem } from "@/lib/password";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Your account — Ladies Collections" },
      {
        name: "description",
        content: "Sign in or create your Ladies Collections shopping account.",
      },
      { property: "og:title", content: "Your account — Ladies Collections" },
      {
        property: "og:description",
        content: "Sign in or create your Ladies Collections shopping account.",
      },
    ],
  }),
  component: CustomerAuthPage,
});

type Mode = "signin" | "signup" | "forgot";

function CustomerAuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const routeAccount = useCallback(
    async (userId: string) => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (error) {
        toast.error("We couldn't check your account. Please try again.");
        return;
      }
      if (data.length) navigate({ to: "/admin", replace: true });
      else navigate({ to: "/", replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (!loading && user) void routeAccount(user.id);
  }, [user, loading, routeAccount]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });
        if (error || !data.user) {
          toast.error("That email and password combination wasn't recognised.");
          return;
        }
        await routeAccount(data.user.id);
      } else if (mode === "signup") {
        const { data: signupEnabled, error: readinessError } =
          await supabase.rpc("customer_signup_enabled");
        if (readinessError || signupEnabled !== true) {
          toast.error("Customer registration is being prepared. Please try again shortly.");
          return;
        }
        const normalizedEmail = email.trim().toLowerCase();
        const problem = passwordProblem(password, normalizedEmail);
        if (problem) {
          toast.error(problem);
          return;
        }
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: fullName.trim(), account_type: "customer" },
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        if (data.session && data.user) {
          await routeAccount(data.user.id);
        } else {
          setSent(true);
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) toast.error(error.message);
        else setSent(true);
      }
    } finally {
      setBusy(false);
    }
  }

  const title =
    mode === "signin"
      ? "Welcome back"
      : mode === "signup"
        ? "Create your account"
        : "Reset password";

  return (
    <main className="storefront-theme store-auth min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <Link to="/" className="store-auth-back">
          <ArrowLeft size={16} /> Back to the boutique
        </Link>
        <span className="store-editorial-label hidden sm:inline">
          Ladies Collections · The Boutique
        </span>
      </div>
      <div className="mx-auto grid min-h-[78vh] max-w-6xl items-center gap-10 py-10 lg:grid-cols-[1fr_25rem]">
        <section className="store-auth-story hidden lg:block">
          <p className="store-editorial-label">
            <span aria-hidden="true">✦</span> Your boutique, close at hand
          </p>
          <h1 className="mt-4 max-w-2xl text-7xl font-semibold leading-[0.95]">
            A little more <em>personal.</em>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted-foreground">
            Keep your favourite pieces and future orders together in one lovely place.
          </p>
          <div className="store-auth-ornament" aria-hidden="true">
            <Flower2 size={132} strokeWidth={0.65} />
          </div>
        </section>
        <section className="store-auth-card">
          <div className="store-auth-mark">
            <Flower2 size={19} strokeWidth={1.5} />
          </div>
          {sent ? (
            <div className="py-8 text-center">
              <MailCheck className="mx-auto h-10 w-10 text-primary" />
              <h2 className="mt-5 text-3xl font-semibold">Check your email</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                {mode === "signup"
                  ? "We sent you a link to confirm your account."
                  : mode === "forgot"
                    ? "We sent you a password reset link."
                    : "Follow the link in the email to continue."}
              </p>
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
              <p className="store-editorial-label text-center">Your account</p>
              <h2 className="mt-1 text-center text-4xl font-semibold">{title}</h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {mode === "signup"
                  ? "Create an account for a more personal shopping experience."
                  : mode === "forgot"
                    ? "Enter the email on your account and we’ll send a reset link."
                    : "Sign in to your Ladies Collections account."}
              </p>
              <form onSubmit={onSubmit} className="mt-7 space-y-4">
                {mode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="full-name">Full name</Label>
                    <Input
                      id="full-name"
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="customer-email">Email</Label>
                  <Input
                    id="customer-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={160}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                {mode !== "forgot" ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="customer-password">Password</Label>
                      {mode === "signin" ? (
                        <button
                          type="button"
                          onClick={() => setMode("forgot")}
                          className="text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      ) : null}
                    </div>
                    <Input
                      id="customer-password"
                      type="password"
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      required
                      minLength={10}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                    {mode === "signup" ? (
                      <p className="text-xs text-muted-foreground">
                        Use at least 10 characters with letters and numbers.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <Button type="submit" className="store-action mt-2 w-full" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : mode === "signin"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create account"
                        : "Send reset link"}
                </Button>
              </form>
              <div className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">
                {mode === "signin" ? (
                  <>
                    New to the boutique?{" "}
                    <button
                      onClick={() => setMode("signup")}
                      className="font-medium text-primary hover:underline"
                    >
                      Create an account
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setMode("signin")}
                    className="font-medium text-primary hover:underline"
                  >
                    Back to sign in
                  </button>
                )}
              </div>
              {mode !== "forgot" ? (
                <Link
                  to="/staff-login"
                  className="mt-5 block text-center text-xs text-muted-foreground hover:text-primary"
                >
                  Staff sign in
                </Link>
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
