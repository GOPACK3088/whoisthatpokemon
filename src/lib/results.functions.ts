import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RETRO_MAX_ID = 386; // Gen 1–3 boundary

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
  mode: z.enum(["classic", "retro"]),
  guessesUsed: z.number().int().min(1).max(10),
  won: z.boolean(),
});

export const submitDailyResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    console.log("[submitDailyResult] user:", userId, "date:", data.puzzleDate,
      "slot:", data.slot, "mode:", data.mode, "won:", data.won);

    const { error: insertErr } = await supabase.from("daily_results").insert({
      user_id: userId,
      puzzle_date: data.puzzleDate,
      slot: data.slot,
      mode: data.mode,
      guesses_used: data.guessesUsed,
      won: data.won,
    });

    if (insertErr) {
      const isDuplicate =
        insertErr.code === "23505" ||
        insertErr.message.toLowerCase().includes("duplicate");
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
    if (upErr) {
      console.error("[submitDailyResult] upsert error:", upErr);
      throw new Error(upErr.message);
    }

    console.log("[submitDailyResult] done — total_played:", updated.total_played,
      "streak:", currentStreak);
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

// ─── Exported types ───────────────────────────────────────────────────────────

export interface CaughtLeaderboardRow {
  user_id: string;
  display_name: string;
  total_caught: number;
}

export interface TodayStats {
  players: number;
  solved: number;
  avg_guesses: number | null;
}

export interface LeaderboardData {
  classic: CaughtLeaderboardRow[];   // caught pokemon_id > 386, sorted desc
  retro: CaughtLeaderboardRow[];     // caught pokemon_id <= 386, sorted desc
  today: { classic: TodayStats; retro: TodayStats };
}

// ─── getLeaderboard ───────────────────────────────────────────────────────────
// Public — no auth required. Anon key + public RLS policies required on all tables.
//
// Classic leaderboard: caught_pokemon where pokemon_id > 386
// Retro leaderboard:   caught_pokemon where pokemon_id <= 386
// Today stats: split by mode column on daily_results

export const getLeaderboard = createServerFn({ method: "GET" })
  .handler(async (): Promise<LeaderboardData> => {
    const db = anonClient();
    const today = new Date().toISOString().slice(0, 10);

    const [
      { data: classicCaught, error: e1 },
      { data: retroCaught,   error: e2 },
      { data: profiles,      error: e3 },
      { data: todayResults,  error: e4 },
    ] = await Promise.all([
      // Classic: pokemon_id > 386 (Gen 4+)
      db.from("caught_pokemon")
        .select("user_id")
        .gt("pokemon_id", RETRO_MAX_ID),

      // Retro: pokemon_id <= 386 (Gen 1–3)
      db.from("caught_pokemon")
        .select("user_id")
        .lte("pokemon_id", RETRO_MAX_ID),

      // Display names
      db.from("profiles")
        .select("id, display_name"),

      // Today's results for summary boxes
      db.from("daily_results")
        .select("user_id, guesses_used, won, mode")
        .eq("puzzle_date", today),
    ]);

    if (e1) console.error("[leaderboard] classic caught:", e1.message);
    if (e2) console.error("[leaderboard] retro caught:", e2.message);
    if (e3) console.error("[leaderboard] profiles:", e3.message);
    if (e4) console.error("[leaderboard] todayResults:", e4.message);

    console.log("[leaderboard] today:", today,
      "| classicCaught:", classicCaught?.length ?? 0,
      "| retroCaught:", retroCaught?.length ?? 0,
      "| profiles:", profiles?.length ?? 0,
      "| todayResults:", todayResults?.length ?? 0,
    );

    const nameMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name?.trim() || "Player"])
    );

    // ── Build per-mode leaderboard rows ──────────────────────────────────────

    function buildRows(rows: { user_id: string }[]): CaughtLeaderboardRow[] {
      const countByUser = new Map<string, number>();
      for (const r of rows) {
        countByUser.set(r.user_id, (countByUser.get(r.user_id) ?? 0) + 1);
      }
      return Array.from(countByUser.entries())
        .map(([user_id, total_caught]) => ({
          user_id,
          display_name: nameMap.get(user_id) ?? "Player",
          total_caught,
        }))
        .sort((a, b) => b.total_caught - a.total_caught);
    }

    const classicRows = buildRows(classicCaught ?? []);
    const retroRows   = buildRows(retroCaught ?? []);

    console.log("[leaderboard] classic rows:", classicRows.length,
      "retro rows:", retroRows.length);

    // ── Today stats split by mode ────────────────────────────────────────────

    const emptyToday = (): TodayStats => ({ players: 0, solved: 0, avg_guesses: null });
    const classicToday = emptyToday();
    const retroToday   = emptyToday();
    const guessSums    = { classic: 0, retro: 0 };

    for (const r of todayResults ?? []) {
      const mode = (r as { mode?: string }).mode === "retro" ? "retro" : "classic";
      const bucket = mode === "retro" ? retroToday : classicToday;
      bucket.players += 1;
      if (r.won) {
        bucket.solved += 1;
        guessSums[mode] += r.guesses_used;
      }
    }
    if (classicToday.solved > 0)
      classicToday.avg_guesses =
        Math.round((guessSums.classic / classicToday.solved) * 10) / 10;
    if (retroToday.solved > 0)
      retroToday.avg_guesses =
        Math.round((guessSums.retro / retroToday.solved) * 10) / 10;

    return {
      classic: classicRows,
      retro: retroRows,
      today: { classic: classicToday, retro: retroToday },
    };
  });
