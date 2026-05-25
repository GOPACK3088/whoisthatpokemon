import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getLeaderboard, type CaughtLeaderboardRow } from "@/lib/results.functions";
import { MODES, type GameMode } from "@/lib/pokemon";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => ({
    meta: [
      { title: "Leaderboard — PokéCatch" },
      { name: "description", content: "Top trainers ranked by Pokémon caught." },
    ],
  }),
});

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModeTabs({ active, onChange }: { active: GameMode; onChange: (m: GameMode) => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-lg bg-zinc-900 border border-zinc-700 w-fit">
      {(Object.entries(MODES) as [GameMode, typeof MODES[GameMode]][]).map(([key, cfg]) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
            active === key
              ? "bg-yellow-500 text-black shadow-sm"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          {cfg.label}
          <span className="ml-1.5 text-xs opacity-70">{cfg.description}</span>
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-zinc-400 uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

function CaughtTable({ rows }: { rows: CaughtLeaderboardRow[] }) {
  return (
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LeaderboardPage() {
  const fetchFn = useServerFn(getLeaderboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchFn(),
    staleTime: 60_000,
  });

  const [modeTab, setModeTab] = useState<GameMode>("classic");

  const todayStats = data?.today[modeTab];
  const rows = modeTab === "classic" ? (data?.classic ?? []) : (data?.retro ?? []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-white">Leaderboard</h1>

      <ModeTabs active={modeTab} onChange={setModeTab} />

      {isLoading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : error ? (
        <p className="text-red-400 text-sm">Failed to load — check server logs.</p>
      ) : (
        <>
          {/* Today's stats for selected mode */}
          <section className="grid grid-cols-3 gap-3">
            <Stat label="Players today" value={todayStats?.players ?? 0} />
            <Stat label="Solved today"  value={todayStats?.solved ?? 0} />
            <Stat
              label="Avg guesses"
              value={todayStats?.avg_guesses != null ? String(todayStats.avg_guesses) : "—"}
            />
          </section>

          {/* Caught leaderboard */}
          <section className="space-y-2">
            <h2 className="text-xl font-semibold text-white">
              {modeTab === "classic" ? "Classic" : "Retro"} — Most Caught
            </h2>
            <CaughtTable rows={rows} />
          </section>
        </>
      )}
    </div>
  );
}
