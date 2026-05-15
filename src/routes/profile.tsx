import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyStats } from "@/lib/results.functions";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Profile — Pokédle" }] }),
});

function ProfilePage() {
  const { user, loading } = useAuth();
  const fetchFn = useServerFn(getMyStats);
  const { data, isLoading } = useQuery({
    queryKey: ["my-stats"],
    queryFn: () => fetchFn(),
    enabled: !!user,
  });

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center space-y-3">
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-muted-foreground">Sign in to view your stats.</p>
        <Link to="/login" className="text-primary underline">Sign in</Link>
      </div>
    );
  }

  const stats = data?.stats;
  const dist = (stats?.guess_distribution as Record<string, number> | undefined) ?? {};
  const maxBar = Math.max(1, ...Object.values(dist));

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{data?.profile?.display_name ?? "Trainer"}</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-4 gap-3">
            <Stat label="Played" value={stats?.total_played ?? 0} />
            <Stat label="Won" value={stats?.total_won ?? 0} />
            <Stat label="Streak" value={stats?.current_streak ?? 0} />
            <Stat label="Best" value={stats?.max_streak ?? 0} />
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Guess distribution</h2>
            <div className="space-y-1">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                const v = dist[String(n)] ?? 0;
                return (
                  <div key={n} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-right text-muted-foreground">{n}</span>
                    <div className="flex-1 bg-muted rounded h-6 overflow-hidden">
                      <div
                        className="bg-[var(--tile-correct)] h-full flex items-center justify-end px-2 text-xs text-[var(--tile-correct-foreground)] font-medium"
                        style={{ width: `${Math.max(8, (v / maxBar) * 100)}%` }}
                      >
                        {v}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-xl font-semibold">Recent results</h2>
            <div className="rounded-lg border border-border divide-y divide-border">
              {(data?.results ?? []).map((r) => (
                <div key={r.puzzle_date} className="flex justify-between items-center px-3 py-2 text-sm">
                  <span className="font-mono">{r.puzzle_date}</span>
                  <span className={r.won ? "text-[var(--tile-correct)] font-medium" : "text-muted-foreground"}>
                    {r.won ? `Solved in ${r.guesses_used}/7` : "Missed"}
                  </span>
                </div>
              ))}
              {(data?.results.length ?? 0) === 0 && (
                <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                  Play your first puzzle!
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}
