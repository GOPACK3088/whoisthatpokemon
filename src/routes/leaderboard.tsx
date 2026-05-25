import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getLeaderboard, type LeaderboardRow } from "@/lib/results.functions";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => ({
    meta: [
      { title: "Leaderboard — PokéCatch" },
      { name: "description", content: "Top trainers ranked by Pokémon caught." },
    ],
  }),
});

function LeaderboardPage() {
  const fetchFn = useServerFn(getLeaderboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
  });

  const rows: LeaderboardRow[] = data ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-white">Leaderboard</h1>

      {isLoading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : error ? (
        <p className="text-red-400 text-sm">Failed to load — check server logs.</p>
      ) : (
        <div className="rounded-lg border border-zinc-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800">
              <tr>
                <th className="text-left px-3 py-2 text-zinc-500 w-8">#</th>
                <th className="text-left px-3 py-2 text-zinc-400">Player</th>
                <th className="text-right px-3 py-2 text-zinc-400">Caught</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.user_id}
                  className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                >
                  <td className="px-3 py-2.5 text-zinc-600 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5 font-medium text-white">{row.display_name}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-yellow-400 font-semibold">
                    {row.total_caught}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-10 text-center text-zinc-600">
                    No catches yet — be the first!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
