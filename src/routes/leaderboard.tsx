import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getLeaderboard, type LeaderboardRow } from "@/lib/results.functions";
import { MODES, type GameMode } from "@/lib/pokemon";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
  head: () => ({
    meta: [
      { title: "Leaderboard — PokéCatch" },
      { name: "description", content: "Top trainers ranked by all-time stats." },
    ],
  }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof Pick<LeaderboardRow, "total_played" | "guess_rate" | "catch_rate" | "total_caught">;
type SortDir = "asc" | "desc";

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

function ColHeader({
  label,
  short,
  col,
  active,
  dir,
  onSort,
}: {
  label: string;
  short: string;
  col: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const isActive = active === col;
  return (
    <th
      className="px-2 sm:px-3 py-2 text-right cursor-pointer select-none whitespace-nowrap group"
      onClick={() => onSort(col)}
      title={label}
    >
      <span className="inline-flex items-center justify-end gap-1">
        <span className="w-3 text-center shrink-0">
          {isActive
            ? <span className="text-yellow-400 text-xs">{dir === "desc" ? "↓" : "↑"}</span>
            : <span className="text-zinc-700 text-xs opacity-0 group-hover:opacity-100 transition-opacity">↕</span>
          }
        </span>
        <span className={isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-200 transition-colors"}>
          <span className="hidden sm:inline">{label}</span>
          <span className="inline sm:hidden">{short}</span>
        </span>
      </span>
    </th>
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
  const [sortCol, setSortCol] = useState<SortKey>("total_caught");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(col: SortKey) {
    if (col === sortCol) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortCol(col);
      setSortDir("desc");
    }
  }

  const sorted = useMemo<LeaderboardRow[]>(() => {
    const rows = [...(data?.rows ?? [])];
    rows.sort((a, b) => {
      const av = a[sortCol] as number;
      const bv = b[sortCol] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [data?.rows, sortCol, sortDir]);

  const todayStats = data?.today[modeTab];

  const colProps = { active: sortCol, dir: sortDir, onSort: handleSort };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-white">Leaderboard</h1>

      <ModeTabs active={modeTab} onChange={setModeTab} />

      {isLoading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : error ? (
        <p className="text-red-400 text-sm">Failed to load leaderboard. Check the server logs.</p>
      ) : (
        <>
          {/* Today's stats — filtered by selected mode tab */}
          <section className="grid grid-cols-3 gap-3">
            <Stat label="Players today" value={todayStats?.players ?? 0} />
            <Stat label="Solved today"  value={todayStats?.solved ?? 0} />
            <Stat
              label="Avg guesses"
              value={todayStats?.avg_guesses != null ? String(todayStats.avg_guesses) : "—"}
            />
          </section>

          {/* All-time rankings */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-xl font-semibold text-white">All-time rankings</h2>
              <span className="text-xs text-zinc-600">Click a column to sort</span>
            </div>

            <div className="rounded-lg border border-zinc-700 overflow-x-auto">
              <table className="w-full text-xs sm:text-sm min-w-[420px]">
                <thead className="bg-zinc-800">
                  <tr>
                    <th className="text-left px-2 sm:px-3 py-2 text-zinc-500 w-7">#</th>
                    <th className="text-left px-2 sm:px-3 py-2 text-zinc-400">Player</th>
                    <ColHeader label="Games Played" short="G"  col="total_played" {...colProps} />
                    <ColHeader label="Guess %"      short="G%" col="guess_rate"   {...colProps} />
                    <ColHeader label="Catch %"      short="C%" col="catch_rate"   {...colProps} />
                    <ColHeader label="Caught"       short="🎯" col="total_caught" {...colProps} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row, i) => (
                    <tr
                      key={row.user_id}
                      className="border-t border-zinc-800 hover:bg-zinc-800/50 transition-colors"
                    >
                      <td className="px-2 sm:px-3 py-2.5 text-zinc-600 tabular-nums">{i + 1}</td>
                      <td className="px-2 sm:px-3 py-2.5 font-medium text-white max-w-[110px] sm:max-w-none truncate">
                        {row.display_name}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 text-right tabular-nums text-zinc-300">
                        {row.total_played}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 text-right tabular-nums text-zinc-300">
                        {row.guess_rate}%
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 text-right tabular-nums text-zinc-300">
                        {row.catch_rate}%
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 text-right tabular-nums text-yellow-400 font-semibold">
                        {row.total_caught}
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-zinc-600">
                        No players yet — be the first!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-zinc-700">
              Guess % = solved ÷ played &nbsp;·&nbsp; Catch % = caught ÷ catch attempts
            </p>
          </section>
        </>
      )}
    </div>
  );
}
