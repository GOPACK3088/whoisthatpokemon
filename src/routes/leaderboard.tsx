import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getLeaderboard } from "@/lib/results.functions";

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

type Row = {
  user_id: string;
  display_name: string;
  total_played: number;
  total_won: number;
  total_caught: number;
  guess_success_rate: number;
  catch_rate: number;
  current_streak: number;
  max_streak: number;
};

type SortKey = "total_played" | "guess_success_rate" | "catch_rate" | "total_caught";
type SortDir = "asc" | "desc";

// ─── Sortable column header ───────────────────────────────────────────────────

function ColHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
  align = "right",
  title,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  title?: string;
}) {
  const isActive = active === sortKey;
  return (
    <th
      className={`px-3 py-2 cursor-pointer select-none whitespace-nowrap group ${align === "right" ? "text-right" : "text-left"}`}
      title={title}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className={isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-200 transition-colors"}>
          {label}
        </span>
        <span className="w-3 text-center">
          {isActive ? (
            <span className="text-yellow-400 text-xs">{dir === "desc" ? "↓" : "↑"}</span>
          ) : (
            <span className="text-zinc-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity">↕</span>
          )}
        </span>
      </span>
    </th>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LeaderboardPage() {
  const fetchFn = useServerFn(getLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchFn(),
  });

  const [sortKey, setSortKey] = useState<SortKey>("total_caught");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      // Numeric stats default to desc (higher = better); toggle from there
      setSortDir("desc");
    }
  }

  const sorted = useMemo<Row[]>(() => {
    const rows = [...(data?.leaderboard ?? [])] as Row[];
    rows.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : 0;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return rows;
  }, [data?.leaderboard, sortKey, sortDir]);

  const colProps = { active: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold text-white">Leaderboard</h1>

      {isLoading ? (
        <p className="text-zinc-400">Loading…</p>
      ) : (
        <>
          {/* Today's snapshot */}
          <section className="grid grid-cols-3 gap-3">
            <Stat label="Players today" value={data?.todayStats.players ?? 0} />
            <Stat label="Solved today" value={data?.todayStats.solved ?? 0} />
            <Stat
              label="Avg guesses"
              value={data?.todayStats.avgGuesses != null ? String(data.todayStats.avgGuesses) : "—"}
            />
          </section>

          {/* All-time table */}
          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-semibold text-white">All-time rankings</h2>
              <p className="text-xs text-zinc-600">Click a column to sort</p>
            </div>
            <div className="rounded-lg border border-zinc-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800">
                  <tr>
                    <th className="text-left px-3 py-2 text-zinc-400 w-8">#</th>
                    <th className="text-left px-3 py-2 text-zinc-400">Player</th>
                    <ColHeader
                      label="Games"
                      sortKey="total_played"
                      title="Total games played"
                      {...colProps}
                    />
                    <ColHeader
                      label="Guess %"
                      sortKey="guess_success_rate"
                      title="Puzzles solved ÷ played"
                      {...colProps}
                    />
                    <ColHeader
                      label="Catch %"
                      sortKey="catch_rate"
                      title="Pokémon caught ÷ puzzles solved"
                      {...colProps}
                    />
                    <ColHeader
                      label="Caught"
                      sortKey="total_caught"
                      title="Total Pokémon caught all-time"
                      {...colProps}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr key={s.user_id} className="border-t border-zinc-700 hover:bg-zinc-800/40 transition-colors">
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-white">{s.display_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {s.total_played}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {s.guess_success_rate}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                        {s.catch_rate}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-yellow-400 font-semibold">
                        {s.total_caught}
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-zinc-500">
                        No results yet — be the first!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-zinc-600">
              Guess % = solved ÷ played · Catch % = caught ÷ solved
            </p>
          </section>
        </>
      )}
    </div>
  );
}

// ─── Stat box ─────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-center">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-zinc-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}
