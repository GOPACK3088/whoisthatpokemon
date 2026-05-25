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
  mode: z.enum(["classic", "retro"]),
  guessesUsed: z.number().int().min(1).max(10),
  won: z.boolean(),
});

export const submitDailyResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => submitInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

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
      if (!isDuplicate) throw new Error(insertErr.message);
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

    const { data: saved, error: upErr } = await supabase
      .from("user_stats")
      .upsert({
        user_id: userId,
        current_streak: currentStreak,
        max_streak: maxStreak,
        total_played: (existing?.total_played ?? 0) + 1,
        total_won: (existing?.total_won ?? 0) + (data.won ? 1 : 0),
        guess_distribution: dist,
        last_puzzle_date: data.puzzleDate,
        updated_at: new Date().toISOString(),
      })
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
      supabase.from("daily_results")
        .select("puzzle_date, guesses_used, won")
        .eq("user_id", userId)
        .order("puzzle_date", { ascending: false })
        .limit(30),
      supabase.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    ]);
    return { stats, results: results ?? [], profile };
  });

// ─── getLeaderboard ───────────────────────────────────────────────────────────

export interface LeaderboardRow {
  user_id: string;
  display_name: string;
  total_caught: number;
}

export const getLeaderboard = createServerFn({ method: "GET" })
  .handler(async (): Promise<LeaderboardRow[]> => {
    const db = anonClient();

    const [
      { data: caughtRows, error: e1 },
      { data: profiles,   error: e2 },
    ] = await Promise.all([
      db.from("caught_pokemon").select("user_id"),
      db.from("profiles").select("id, display_name"),
    ]);

    if (e1) console.error("[leaderboard] caught_pokemon:", e1.message);
    if (e2) console.error("[leaderboard] profiles:", e2.message);

    const nameMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.display_name?.trim() || "Player"])
    );

    const counts = new Map<string, number>();
    for (const r of caughtRows ?? []) {
      counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([user_id, total_caught]) => ({
        user_id,
        display_name: nameMap.get(user_id) ?? "Player",
        total_caught,
      }))
      .sort((a, b) => b.total_caught - a.total_caught);
  });
