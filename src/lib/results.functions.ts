import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { todayKey } from "@/lib/pokemon";
import type { Database } from "@/integrations/supabase/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isYesterday(prev: string, today: string): boolean {
  const p = new Date(prev + "T00:00:00Z");
  const t = new Date(today + "T00:00:00Z");
  return t.getTime() - p.getTime() === 86400000;
}

/** Parse the slot ("am" | "pm") out of a todayKey string like "2026-05-19-am" */
function slotFromKey(key: string): "am" | "pm" {
  const suffix = key.split("-").at(-1);
  return suffix === "pm" ? "pm" : "am";
}

/** Anon Supabase client for public (unauthenticated) server-side reads. */
function anonClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── submitDailyResult ────────────────────────────────────────────────────────

const submitInput = z.object({
  puzzleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guessesUsed: z.number().int().min(1).max(10),
  won: z.boolean(),
});

export const submitDailyResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const slot = slotFromKey(todayKey());

    const { error: insertErr } = await supabase.from("daily_results").insert({
      user_id: userId,
      puzzle_date: data.puzzleDate,
      slot,
      guesses_used: data.guessesUsed,
      won: data.won,
    });

    if (insertErr && !insertErr.message.includes("duplicate")) {
      throw new Error(insertErr.message);
    }
    if (insertErr) {
      const { data: stats } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return { stats, alreadySubmitted: true };
    }

    const { data: existing } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const dist = (existing?.guess_distribution as Record<string, number>) ?? {
      "1": 0, "2": 0, "3": 0, "4": 0, "5": 0,
      "6": 0, "7": 0, "8": 0, "9": 0, "10": 0,
    };
    if (data.won) dist[String(data.guessesUsed)] = (dist[String(data.guessesUsed)] ?? 0) + 1;

    let currentStreak = existing?.current_streak ?? 0;
    if (data.won) {
      currentStreak =
        existing?.last_puzzle_date && isYesterday(existing.last_puzzle_date, data.puzzleDate)
          ? currentStreak + 1
          : 1;
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
      .from("user_stats")
      .upsert(updated)
      .select()
      .single();
    if (upErr) throw new Error(upErr.message);

    return { stats: saved, alreadySubmitted: false };
  });

// ─── getMyStats ───────────────────────────────────────────────────────────────

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: stats }, { data: results }, { data: profile }] = await Promise.all([
      supabase.from("user_stats").select("*").eq("user_id", userId).maybeSingle(),
      supabase
        .from("daily_results")
        .select("puzzle_date, guesses_used, won")
        .eq("user_id", userId)
        .order("puzzle_date", { ascending: false })
        .limit(30),
      supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    ]);
    return { stats, results: results ?? [], profile };
  });

// ─── getLeaderboard ───────────────────────────────────────────────────────────

export const getLeaderboard = createServerFn({ method: "GET" }).handler(async () => {
  const db = anonClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: statsRows,   error: statsErr   },
    { data: caughtRows,  error: caughtErr  },
    { data: profiles,    error: profileErr },
    { data: todayResults,error: todayErr   },
  ] = await Promise.all([
    db.from("user_stats").select("user_id, total_played, total_won, current_streak, max_streak"),
    db.from("caught_pokemon").select("user_id"),
    db.from("profiles").select("id, display_name"),
    db.from("daily_results").select("user_id, guesses_used, won").eq("puzzle_date", today),
  ]);

  // ── Debug: log every query result to server stdout ──────────────────────
  console.log("[leaderboard] today:", today);
  console.log("[leaderboard] statsRows count:", statsRows?.length ?? "null", "| error:", statsErr?.message ?? "none");
  console.log("[leaderboard] statsRows data:", JSON.stringify(statsRows));
  console.log("[leaderboard] caughtRows count:", caughtRows?.length ?? "null", "| error:", caughtErr?.message ?? "none");
  console.log("[leaderboard] caughtRows data:", JSON.stringify(caughtRows));
  console.log("[leaderboard] profiles count:", profiles?.length ?? "null", "| error:", profileErr?.message ?? "none");
  console.log("[leaderboard] profiles data:", JSON.stringify(profiles));
  console.log("[leaderboard] todayResults count:", todayResults?.length ?? "null", "| error:", todayErr?.message ?? "none");
  console.log("[leaderboard] todayResults data:", JSON.stringify(todayResults));

  // ── Build lookup maps ────────────────────────────────────────────────────

  // profiles keyed by id — used to join display name onto stats rows
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? "Player"]));
  console.log("[leaderboard] nameMap entries:", [...nameMap.entries()]);

  // Count caught per user
  const caughtByUser = new Map<string, number>();
  for (const row of caughtRows ?? []) {
    caughtByUser.set(row.user_id, (caughtByUser.get(row.user_id) ?? 0) + 1);
  }
  console.log("[leaderboard] caughtByUser entries:", [...caughtByUser.entries()]);

  // ── Build leaderboard rows ───────────────────────────────────────────────
  const leaderboard = (statsRows ?? []).map((s) => {
    const totalCaught = caughtByUser.get(s.user_id) ?? 0;
    const guessSuccessRate =
      (s.total_played ?? 0) > 0
        ? Math.round(((s.total_won ?? 0) / (s.total_played ?? 1)) * 100)
        : 0;
    const catchRate =
      (s.total_won ?? 0) > 0
        ? Math.round((totalCaught / (s.total_won ?? 1)) * 100)
        : 0;

    const row = {
      user_id: s.user_id,
      display_name: nameMap.get(s.user_id) ?? "Player",
      total_played: s.total_played ?? 0,
      total_won: s.total_won ?? 0,
      total_caught: totalCaught,
      guess_success_rate: guessSuccessRate,
      catch_rate: catchRate,
      current_streak: s.current_streak ?? 0,
      max_streak: s.max_streak ?? 0,
    };

    console.log(
      `[leaderboard] player ${s.user_id}: display_name="${row.display_name}" total_played=${row.total_played} total_won=${row.total_won} total_caught=${row.total_caught} guess_rate=${row.guess_success_rate}% catch_rate=${row.catch_rate}%`,
    );

    return row;
  });

  // ── Today stats ──────────────────────────────────────────────────────────
  const wonToday = (todayResults ?? []).filter((r) => r.won);
  const todayStats = {
    players: todayResults?.length ?? 0,
    solved: wonToday.length,
    avgGuesses:
      wonToday.length > 0
        ? Math.round(
            (wonToday.reduce((s, r) => s + r.guesses_used, 0) / wonToday.length) * 10,
          ) / 10
        : null,
  };

  console.log("[leaderboard] todayStats:", todayStats);
  console.log("[leaderboard] leaderboard rows:", leaderboard.length);

  return { leaderboard, todayStats };
});
