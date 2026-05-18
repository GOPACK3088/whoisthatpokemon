import { Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export function Header() {
  const { user, loading } = useAuth();
  return (
    <header className="border-b border-border bg-black sticky top-0 z-40">
      <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg tracking-tight text-white">
          PokéCatch
        </Link>
        <nav className="flex items-center gap-1 text-sm text-white">
          <Link to="/" className="px-3 py-1.5 rounded-md hover:bg-accent text-white" activeOptions={{ exact: true }} activeProps={{ className: "px-3 py-1.5 rounded-md bg-accent text-white" }}>
            Play
          </Link>
          <Link to="/how-to-play" className="px-3 py-1.5 rounded-md hover:bg-accent text-white" activeProps={{ className: "px-3 py-1.5 rounded-md bg-accent text-white" }}>
            How
          </Link>
          <Link to="/leaderboard" className="px-3 py-1.5 rounded-md hover:bg-accent text-white" activeProps={{ className: "px-3 py-1.5 rounded-md bg-accent text-white" }}>
            Leaderboard
          </Link>
          <Link to="/pokedex" className="px-3 py-1.5 rounded-md hover:bg-accent text-white" activeProps={{ className: "px-3 py-1.5 rounded-md bg-accent text-white" }}>
            Pokédex
          </Link>
          {!loading && user ? (
            <>
              <Link to="/profile" className="px-3 py-1.5 rounded-md hover:bg-accent text-white" activeProps={{ className: "px-3 py-1.5 rounded-md bg-accent text-white" }}>
                Profile
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:text-white"
                onClick={() => supabase.auth.signOut()}
              >
                Sign out
              </Button>
            </>
          ) : !loading ? (
            <Link to="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
