import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getLeaderboard } from "@/lib/results.functions";
import { type GameMode, MODES } from "@/lib/pokemon";

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
  mode?: GameMode;
};

type SortKey = "total_played" | "guess_success_rate" | "catch_rate" | "total_caught";
type SortDir = "asc" | "desc";

// ─── Sortable column header ───────────────────────────────────────────────────

function ColHeader({
  label,
  shortLabel,
  sortKey,
  active,
  dir,
  onSort,
  align = "right",
  title,
}: {
  label: string;
  shortLabel?: string;
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
      className={`px-2 sm:px-3 py-2 cursor-pointer select-none whitespace-nowrap group ${
        align === "right" ? "text-right" : "text-left"
      }`}
      title={title}
      onClick={() => onSort(sortKey)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <span className={isActive ? "text-white" : "text-zinc-400 group-hover:text-zinc-200 transition-colors"}>
          {shortLabel ? (
            <>
              <span className="hidden sm:inline">{label}</span>
              <span className="inline sm:hidden">{shortLabel}</span>
            </>
          ) : label}
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

// ─── Mode tabs ────────────────────────────────────────────────────────────────

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

// ─── Leaderboard table ────────────────────────────────────────────────────────

function LeaderboardTable({ rows }: { rows: Row[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("total_caught");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo<Row[]>(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  const colProps = { active: sortKey, dir: sortDir, onSort: handleSort };

  return (
    <div className="rounded-lg border border-zinc-700 overflow-x-auto">
      <table className="w-full text-xs sm:text-sm min-w-[420px]">
        <thead className="bg-zinc-800">
          <tr>
            <th className="text-left px-2 sm:px-3 py-2 text-zinc-400 w-7 sm:w-8">#</th>
            <th className="text-left px-2 sm:px-3 py-2 text-zinc-400">Player</th>
            <ColHeader label="Games"   shortLabel="G"  sortKey="total_played"        title="Total games played"                    {...colProps} />
            <ColHeader label="Guess %" shortLabel="G%" sortKey="guess_success_rate"  title="Puzzles solved ÷ played"               {...colProps} />
            <ColHeader label="Catch %" shortLabel="C%" sortKey="catch_rate"          title="Pokémon caught ÷ catch attempts"        {...colProps} />
            <ColHeader label="Caught"  shortLabel="🎯" sortKey="total_caught"        title="Total Pokémon caught all-time"          {...colProps} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((s, i) => (
            <tr key={s.user_id} className="border-t border-zinc-700 hover:bg-zinc-800/40 transition-colors">
              <td className="px-2 sm:px-3 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
              <td className="px-2 sm:px-3 py-2 font-medium text-white max-w-[100px] sm:max-w-none truncate">{s.display_name}</td>
              <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-zinc-300">{s.total_played}</td>
              <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-zinc-300">{s.guess_success_rate}%</td>
              <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-zinc-300">{s.catch_rate}%</td>
              <td className="px-2 sm:px-3 py-2 text-right tabular-nums text-yellow-400 font-semibold">{s.total_caught}</td>
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function LeaderboardPage() {
  const fetchFn = useServerFn(getLeaderboard);
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: () => fetchFn(),
  });

  const [modeTab, setModeTab] = useState<GameMode>("classic");

  // Filter leaderboard rows by mode.
  // Rows without a mode field (older data) are shown under Classic.
  const filteredRows = useMemo<Row[]>(() => {
    const all = (data?.leaderboard ?? []) as Row[];
    if (modeTab === "classic") {
      return all.filter((r) => !r.mode || r.mode === "classic");
    }
    return all.filter((r) => r.mode === modeTab);
  }, [data?.leaderboard, modeTab]);

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
            <Stat label="Solved today"  value={data?.todayStats.solved ?? 0} />
            <Stat
              label="Avg guesses"
              value={data?.todayStats.avgGuesses != null ? String(data.todayStats.avgGuesses) : "—"}
            />
          </section>

          {/* Mode tabs + table */}
          <section className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-semibold text-white">All-time rankings</h2>
              <p className="text-xs text-zinc-600">Click a column to sort</p>
            </div>

            <ModeTabs active={modeTab} onChange={setModeTab} />

            <LeaderboardTable rows={filteredRows} />

            <p className="text-xs text-zinc-600">
              Guess % = solved ÷ played · Catch % = caught ÷ catch attempts
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
