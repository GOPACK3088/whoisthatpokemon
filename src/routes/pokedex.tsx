import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { POKEMON } from "@/lib/pokemon";

export const Route = createFileRoute("/pokedex")({
  component: PokedexPage,
  head: () => ({
    meta: [{ title: "My Pokédex — PokéCatch" }],
  }),
});

function PokedexPage() {
  const { user, loading } = useAuth();
  const [caughtIds, setCaughtIds] = useState<Set<number>>(new Set());
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) {
      setFetching(false);
      return;
    }
    supabase
      .from("caught_pokemon")
      .select("pokemon_id")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (!error && data) {
          setCaughtIds(new Set(data.map((r) => r.pokemon_id)));
        }
        setFetching(false);
      });
  }, [user]);

  if (loading || fetching) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-zinc-400 animate-pulse text-sm">Loading Pokédex…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
        <div className="text-6xl">📕</div>
        <h1 className="text-2xl font-bold text-white">Your Pokédex</h1>
        <p className="text-zinc-400 max-w-sm text-sm">
          Sign in to track the Pokémon you've caught and build your personal Pokédex.
        </p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center rounded-md bg-yellow-500 px-5 py-2 text-sm font-semibold text-black hover:bg-yellow-400 transition-colors"
        >
          Sign in / Sign up
        </Link>
      </div>
    );
  }

  const caught = caughtIds.size;
  const total = POKEMON.length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">My Pokédex</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {caught} / {total} caught
          </p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-yellow-400">
            {Math.round((caught / total) * 100)}%
          </div>
          <div className="text-xs text-zinc-500">complete</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-yellow-400 transition-all duration-700"
          style={{ width: `${(caught / total) * 100}%` }}
        />
      </div>

      {/* Grid */}
      <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-2">
        {POKEMON.map((p) => {
          const isCaught = caughtIds.has(p.id);
          return (
            <div
              key={p.id}
              title={isCaught ? p.name.replace(/-/g, " ") : `#${p.id}`}
              className={`flex flex-col items-center rounded-lg p-1 border transition-all ${
                isCaught
                  ? "border-yellow-500/40 bg-zinc-800/60 hover:border-yellow-400"
                  : "border-zinc-800 bg-zinc-900/40"
              }`}
            >
              <div className="relative w-10 h-10">
                <img
                  src={p.spriteUrl}
                  alt={isCaught ? p.name : `#${p.id}`}
                  loading="lazy"
                  className={`w-full h-full object-contain transition-all ${
                    isCaught ? "" : "brightness-0 opacity-40"
                  }`}
                />
              </div>
              <span
                className={`text-[9px] mt-0.5 text-center leading-tight truncate w-full text-center ${
                  isCaught ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                #{p.id}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
