import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLeaderboard } from "@/lib/results.functions";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => ({
    meta: [
      { title: "Leaderboard — Pokédle" },
      { name: "description", content: "Top streaks and today's solve rate." },
    ],
  }),
});

function LeaderboardPage() {
  const { user, loading } = useAuth();
  const fetchFn = useServerFn(getLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchFn(),
    enabled: !!user,
  });

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center space-y-3">
        <h1 className="text-2xl font-bold">Leaderboard</h1>
        <p className="text-muted-foreground">Sign in to view the leaderboard.</p>
        <Link to="/login" className="text-primary underline">Sign in</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold">Leaderboard</h1>

      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-3">
            <Stat label="Players today" value={data?.todayStats.players ?? 0} />
            <Stat label="Solved today" value={data?.todayStats.solved ?? 0} />
            <Stat
              label="Avg guesses"
              value={
                data?.todayStats.avgGuesses != null
                  ? data.todayStats.avgGuesses.toFixed(1)
                  : "—"
              }
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Top streaks</h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">#</th>
                    <th className="text-left px-3 py-2">Player</th>
                    <th className="text-right px-3 py-2">Best</th>
                    <th className="text-right px-3 py-2">Current</th>
                    <th className="text-right px-3 py-2">Solved</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.topStreaks.map((s, i) => (
                    <tr key={s.user_id} className="border-t border-border">
                      <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{s.display_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.max_streak}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.current_streak}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.total_won}/{s.total_played}
                      </td>
                    </tr>
                  ))}
                  {(data?.topStreaks.length ?? 0) === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                        No results yet — be the first!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}
