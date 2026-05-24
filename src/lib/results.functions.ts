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
// puzzleDate: bare date "YYYY-MM-DD" (client strips slot suffix before sending)
// slot:       "am" | "pm" passed explicitly from client — no re-derivation needed

const submitInput = z.object({
  puzzleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // bare date only
  slot: z.enum(["am", "pm"]),                              // explicit from client
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
      // Postgres unique violation = already submitted this slot today
      const isDuplicate =
        insertErr.code === "23505" || insertErr.message.toLowerCase().includes("duplicate");
      if (!isDuplicate) {
        console.error("[submitDailyResult] insert error:", insertErr);
        throw new Error(insertErr.message);
      }
      console.log("[submitDailyResult] already submitted, returning existing stats");
      const { data: stats } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return { stats, alreadySubmitted: true };
    }

    console.log("[submitDailyResult] insert ok, updating user_stats");

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

    // Streak: last_puzzle_date is stored as bare "YYYY-MM-DD" so isYesterday works correctly
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
      last_puzzle_date: data.puzzleDate,   // bare date — streak math depends on this
      updated_at: new Date().toISOString(),
    };

    const { data: saved, error: upErr } = await supabase
      .from("user_stats")
      .upsert(updated)
      .select()
      .single();

    if (upErr) {
      console.error("[submitDailyResult] upsert error:", upErr);
      throw new Error(upErr.message);
    }

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
    { data: statsRows,    error: statsErr    },
    { data: caughtRows,   error: caughtErr   },
    { data: profiles,     error: profileErr  },
    { data: todayResults, error: todayErr    },
  ] = await Promise.all([
    db.from("user_stats").select("user_id, total_played, total_won, current_streak, max_streak"),
    db.from("caught_pokemon").select("user_id"),
    db.from("profiles").select("id, display_name"),
    db.from("daily_results").select("user_id, guesses_used, won").eq("puzzle_date", today),
  ]);

  console.log("[leaderboard] today:", today);
  console.log("[leaderboard] statsRows:", statsRows?.length ?? "null", statsErr?.message ?? "ok");
  console.log("[leaderboard] statsRows data:", JSON.stringify(statsRows));
  console.log("[leaderboard] caughtRows:", caughtRows?.length ?? "null", caughtErr?.message ?? "ok");
  console.log("[leaderboard] caughtRows data:", JSON.stringify(caughtRows));
  console.log("[leaderboard] profiles:", profiles?.length ?? "null", profileErr?.message ?? "ok");
  console.log("[leaderboard] profiles data:", JSON.stringify(profiles));
  console.log("[leaderboard] todayResults:", todayResults?.length ?? "null", todayErr?.message ?? "ok");

  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? "Player"]));

  const caughtByUser = new Map<string, number>();
  for (const row of caughtRows ?? []) {
    caughtByUser.set(row.user_id, (caughtByUser.get(row.user_id) ?? 0) + 1);
  }

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

    console.log(`[leaderboard] ${s.user_id}: name="${row.display_name}" played=${row.total_played} won=${row.total_won} caught=${row.total_caught} guess%=${row.guess_success_rate} catch%=${row.catch_rate}`);
    return row;
  });

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

  return { leaderboard, todayStats };
});
