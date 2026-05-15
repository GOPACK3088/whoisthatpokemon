import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const submitInput = z.object({
  puzzleDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guessesUsed: z.number().int().min(1).max(7),
  won: z.boolean(),
});

function isYesterday(prev: string, today: string): boolean {
  const p = new Date(prev + "T00:00:00Z");
  const t = new Date(today + "T00:00:00Z");
  return t.getTime() - p.getTime() === 86400000;
}

export const submitDailyResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Insert result; ignore if already exists for today
    const { error: insertErr } = await supabase.from("daily_results").insert({
      user_id: userId,
      puzzle_date: data.puzzleDate,
      guesses_used: data.guessesUsed,
      won: data.won,
    });
    if (insertErr && !insertErr.message.includes("duplicate")) {
      throw new Error(insertErr.message);
    }
    if (insertErr) {
      // Already submitted for today - return current stats
      const { data: stats } = await supabase
        .from("user_stats")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return { stats, alreadySubmitted: true };
    }

    // Fetch existing stats
    const { data: existing } = await supabase
      .from("user_stats")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    const dist = (existing?.guess_distribution as Record<string, number>) ?? {
      "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0,
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

export const getLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const today = new Date().toISOString().slice(0, 10);

    const [{ data: topStreaks }, { data: todayResults }, { data: profiles }] = await Promise.all([
      supabase
        .from("user_stats")
        .select("user_id, current_streak, max_streak, total_won, total_played")
        .order("max_streak", { ascending: false })
        .limit(20),
      supabase
        .from("daily_results")
        .select("user_id, guesses_used, won")
        .eq("puzzle_date", today),
      supabase.from("profiles").select("id, display_name"),
    ]);

    const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    const todayStats = {
      players: todayResults?.length ?? 0,
      solved: todayResults?.filter((r) => r.won).length ?? 0,
      avgGuesses:
        todayResults && todayResults.filter((r) => r.won).length > 0
          ? todayResults.filter((r) => r.won).reduce((s, r) => s + r.guesses_used, 0) /
            todayResults.filter((r) => r.won).length
          : null,
    };

    return {
      topStreaks: (topStreaks ?? []).map((s) => ({
        ...s,
        display_name: nameMap.get(s.user_id) ?? "Player",
      })),
      todayStats,
    };
  });
