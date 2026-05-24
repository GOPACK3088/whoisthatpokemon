import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isYesterday(prev: string, today: string): boolean {
  const p = new Date(prev + "T00:00:00Z");
  const t = new Date(today + "T00:00:00Z");
  return t.getTime() - p.getTime() === 86400000;
}

function anonClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── submitDailyResult ────────────────────────────────────────────────────────

const submitInput = z.object({
  puzzleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["am", "pm"]),
  guessesUsed: z.number().int().min(1).max(10),
  won: z.boolean(),
});

export const submitDailyResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    console.log("[submitDailyResult] user:", userId, "date:", data.puzzleDate, "slot:", data.slot, "won:", data.won);

    const { error: insertErr } = await supabase.from("daily_results").insert({
      user_id: userId,
      puzzle_date: data.puzzleDate,
      slot: data.slot,
      guesses_used: data.guessesUsed,
      won: data.won,
    });

    if (insertErr) {
      const isDuplicate = insertErr.code === "23505" || insertErr.message.toLowerCase().includes("duplicate");
      if (!isDuplicate) {
        console.error("[submitDailyResult] insert error:", insertErr);
        throw new Error(insertErr.message);
      }
      console.log("[submitDailyResult] already submitted");
      const { data: stats } = await supabase
        .from("user_stats").select("*").eq("user_id", userId).maybeSingle();
      return { stats, alreadySubmitted: true };
    }

    const { data: existing } = await supabase
      .from("user_stats").select("*").eq("user_id", userId).maybeSingle();

    const dist = (existing?.guess_distribution as Record<string, number>) ?? {
      "1": 0, "2": 0, "3": 0, "4": 0, "5": 0,
      "6": 0, "7": 0, "8": 0, "9": 0, "10": 0,
    };
    if (data.won) dist[String(data.guessesUsed)] = (dist[String(data.guessesUsed)] ?? 0) + 1;

    let currentStreak = existing?.current_streak ?? 0;
    if (data.won) {
      currentStreak =
        existing?.last_puzzle_date && isYesterday(existing.last_puzzle_date, data.puzzleDate)
          ? currentStreak + 1 : 1;
    } else {
      currentStreak = 0;
    }
    const maxStreak = Math.max(existing?.max_streak ?? 0, currentStreak);

    const updated = {
      user_id: userId,
      current_streak: currentStreak,
      max_streak: maxStreak,
      total_played: (existing?.total_played ?? 0) + 1,
      total_won: (existing?.total_won ?? 0) + (data.won ? 1 : 0),
      guess_distribution: dist,
      last_puzzle_date: data.puzzleDate,
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: upErr } = await supabase
      .from("user_stats").upsert(updated).select().single();
    if (upErr) { console.error("[submitDailyResult] upsert error:", upErr); throw new Error(upErr.message); }

    console.log("[submitDailyResult] done — total_played:", updated.total_played, "streak:", currentStreak);
    return { stats: saved, alreadySubmitted: false };
  });

// ─── getMyStats ───────────────────────────────────────────────────────────────

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: stats }, { data: results }, { data: profile }] = await Promise.all([
      supabase.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("daily_results")
        .select("puzzle_date, guesses_used, won")
        .eq("user_id", userId)
        .order("puzzle_date", { ascending: false })
        .limit(30),
      supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    ]);
    return { stats, results: results ?? [], profile };
  });

// ─── LeaderboardRow type (exported so leaderboard.tsx can import it) ──────────

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  total_played: number;
  total_won: number;
  total_caught: number;
  guess_rate: number;   // total_won / total_played as integer percent
  catch_rate: number;   // catch_results successes / attempts as integer percent
}

export interface TodayStats {
  players: number;
  solved: number;
  avg_guesses: number | null;
}

export interface LeaderboardData {
  rows: LeaderboardRow[];
  today: { classic: TodayStats; retro: TodayStats };
}

// ─── getLeaderboard ───────────────────────────────────────────────────────────
// Public — no auth required. Uses the anon key which respects Supabase RLS.
// All tables must have a public SELECT policy for this to return data.
//
// NOTE: user_stats and catch_results have no mode column, so all-time rankings
// are combined across modes. Today's stats are split by mode via daily_puzzles.

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async (): Promise<LeaderboardData> => {
  const db = anonClient();
  const today = new Date().toISOString().slice(0, 10);

  // Run all queries in parallel
  const [
    { data: statsRows,    error: e1 },
    { data: caughtRows,   error: e2 },
    { data: catchRows,    error: e3 },
    { data: profiles,     error: e4 },
    { data: todayResults, error: e5 },
    { data: todayPuzzles, error: e6 },
  ] = await Promise.all([
    // All-time per-user game stats
    db.from("user_stats")
      .select("user_id, total_played, total_won"),

    // Total unique Pokémon caught per user (Pokédex entries)
    db.from("caught_pokemon")
      .select("user_id"),

    // All catch phase attempts with outcome
    db.from("catch_results")
      .select("user_id, caught"),

    // Display names
    db.from("profiles")
      .select("id, display_name"),

    // Today's puzzle results
    db.from("daily_results")
      .select("user_id, guesses_used, won, slot")
      .eq("puzzle_date", today),

    // Today's scheduled puzzles — tells us which slot belongs to which mode
    db.from("daily_puzzles")
      .select("slot, mode")
      .eq("puzzle_date", today),
  ]);

  // Log any query errors (won't throw — we'll just show zeros)
  if (e1) console.error("[leaderboard] user_stats:", e1.message);
  if (e2) console.error("[leaderboard] caught_pokemon:", e2.message);
  if (e3) console.error("[leaderboard] catch_results:", e3.message);
  if (e4) console.error("[leaderboard] profiles:", e4.message);
  if (e5) console.error("[leaderboard] daily_results:", e5.message);
  if (e6) console.error("[leaderboard] daily_puzzles:", e6.message);

  console.log("[leaderboard] today:", today,
    "| stats:", statsRows?.length ?? 0,
    "| caught:", caughtRows?.length ?? 0,
    "| catchResults:", catchRows?.length ?? 0,
    "| profiles:", profiles?.length ?? 0,
    "| todayResults:", todayResults?.length ?? 0,
    "| todayPuzzles:", todayPuzzles?.length ?? 0,
  );

  // ── Build lookup maps ────────────────────────────────────────────────────

  const nameMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name?.trim() || "Player"])
  );

  // Total caught per user
  const caughtCount = new Map<string, number>();
  for (const r of caughtRows ?? []) {
    caughtCount.set(r.user_id, (caughtCount.get(r.user_id) ?? 0) + 1);
  }

  // Catch attempts and successes per user
  const catchTally = new Map<string, { attempts: number; successes: number }>();
  for (const r of catchRows ?? []) {
    const t = catchTally.get(r.user_id) ?? { attempts: 0, successes: 0 };
    t.attempts += 1;
    if (r.caught) t.successes += 1;
    catchTally.set(r.user_id, t);
  }

  // ── All-time leaderboard rows ────────────────────────────────────────────

  const rows: LeaderboardRow[] = (statsRows ?? []).map((s) => {
    const played = s.total_played ?? 0;
    const won    = s.total_won ?? 0;
    const caught = caughtCount.get(s.user_id) ?? 0;
    const tally  = catchTally.get(s.user_id);

    return {
      user_id:      s.user_id,
      display_name: nameMap.get(s.user_id) ?? "Player",
      total_played: played,
      total_won:    won,
      total_caught: caught,
      guess_rate:   played > 0 ? Math.round((won / played) * 100) : 0,
      catch_rate:   tally && tally.attempts > 0
                      ? Math.round((tally.successes / tally.attempts) * 100)
                      : 0,
    };
  });

  console.log("[leaderboard] rows built:", rows.length);
  rows.forEach((r) =>
    console.log(`  ${r.display_name}: played=${r.total_played} won=${r.total_won} caught=${r.total_caught} guess%=${r.guess_rate} catch%=${r.catch_rate}`)
  );

  // ── Today stats split by mode ────────────────────────────────────────────
  // Map each slot ("am"/"pm") to its mode via daily_puzzles for today.
  // If a slot has no puzzle row, it defaults to "classic".

  const slotMode = new Map<string, string>(
    (todayPuzzles ?? []).map((p) => [p.slot, p.mode ?? "classic"])
  );

  const emptyToday = (): TodayStats => ({ players: 0, solved: 0, avg_guesses: null });
  const classicToday = emptyToday();
  const retroToday   = emptyToday();
  const guessSums    = { classic: 0, retro: 0 };

  for (const r of todayResults ?? []) {
    const mode = slotMode.get(r.slot) ?? "classic";
    const bucket = mode === "retro" ? retroToday : classicToday;
    bucket.players += 1;
    if (r.won) {
      bucket.solved += 1;
      guessSums[mode === "retro" ? "retro" : "classic"] += r.guesses_used;
    }
  }

  if (classicToday.solved > 0) {
    classicToday.avg_guesses = Math.round((guessSums.classic / classicToday.solved) * 10) / 10;
  }
  if (retroToday.solved > 0) {
    retroToday.avg_guesses = Math.round((guessSums.retro / retroToday.solved) * 10) / 10;
  }

  console.log("[leaderboard] today classic:", classicToday, "retro:", retroToday);

  return {
    rows,
    today: { classic: classicToday, retro: retroToday },
  };
});
