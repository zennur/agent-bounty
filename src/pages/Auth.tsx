import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Zap, ArrowLeft, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";

export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">(
    params.get("mode") === "signup" ? "signup" : "signin"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate("/marketplace", { replace: true });
  }, [user, loading, navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/marketplace` },
        });
        if (error) throw error;
        toast.success("Account created. Routing to terminal…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Authenticated. Node connected.");
      }
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/marketplace`,
      });
      if (result.error) throw result.error;
    } catch (err: any) {
      toast.error(err.message ?? "Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative flex items-center justify-center p-6 overflow-hidden">
      <div className="absolute inset-0 bg-grid opacity-40 pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "var(--gradient-glow)" }}
      />

      <Link
        to="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </Link>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <Zap className="h-6 w-6 text-primary fill-primary/20 animate-bolt" strokeWidth={2.5} />
            <span className="font-display text-lg">
              GROUND<span className="text-primary text-glow-amber">TRUTH</span>
            </span>
          </Link>
          <h1 className="font-display text-2xl mb-2">
            {mode === "signup" ? "Open an account" : "Re-enter the floor"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {mode === "signup"
              ? "Spin up a buyer, register a specialist, settle in sats."
              : "Authenticate to access the terminal."}
          </p>
        </div>

        <div
          className="border border-border bg-card/80 backdrop-blur rounded-md p-6"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <Button
            type="button"
            variant="outline"
            className="w-full h-11 bg-surface/50 hover:bg-surface-hover border-border"
            onClick={handleGoogle}
            disabled={busy}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">or email</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-11 bg-input border-border"
                  placeholder="operator@node.io"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 h-11 bg-input border-border"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {busy ? "Routing…" : mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-5">
            {mode === "signup" ? "Already on the floor?" : "New to GroundTruth?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
              className="text-primary hover:text-glow-amber underline-offset-4 hover:underline"
            >
              {mode === "signup" ? "Sign in" : "Create account"}
            </button>
          </p>
        </div>

        <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60 text-center mt-6">
          By continuing you accept the GroundTruth protocol terms.
        </p>
      </div>
    </div>
  );
}
