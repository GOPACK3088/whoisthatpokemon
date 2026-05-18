import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — PokéCatch" }] }),
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: displayName || email.split("@")[0] },
          },
        });
        if (error) throw error;
        toast.success("Account created!");
        navigate({ to: "/" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        navigate({ to: "/" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-white">{mode === "signin" ? "Welcome back" : "Create account"}</h1>
        <p className="text-sm text-zinc-400">
          {mode === "signin" ? "Sign in to track your streak." : "Track streaks and join the leaderboard."}
        </p>
      </div>

      <Button variant="outline" className="w-full border-zinc-600 text-white hover:bg-zinc-800" onClick={handleGoogle} disabled={loading}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <div className="flex-1 h-px bg-border" />
        OR
        <div className="flex-1 h-px bg-border" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <div className="space-y-1">
            <Label htmlFor="name" className="text-zinc-300">Display name</Label>
            <Input
              id="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Trainer"
              className="text-white placeholder:text-zinc-500 bg-zinc-900 border-zinc-600"
            />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="email" className="text-zinc-300">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-white bg-zinc-900 border-zinc-600"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="password" className="text-zinc-300">Password</Label>
          <Input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="text-white bg-zinc-900 border-zinc-600"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-zinc-400">
        {mode === "signin" ? "No account?" : "Have an account?"}{" "}
        <button
          type="button"
          className="underline text-white"
          onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
        >
          {mode === "signin" ? "Sign up" : "Sign in"}
        </button>
      </p>
      <p className="text-center text-xs text-zinc-500">
        <Link to="/">← Back to today's puzzle</Link>
      </p>
    </div>
  );
}
