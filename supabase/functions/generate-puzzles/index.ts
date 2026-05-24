import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PokemonEntry {
  id: number;
  name: string;
}

interface DailyPuzzleRow {
  puzzle_date: string;
  slot: "am" | "pm";
  pokemon_id: number;
  pokemon_name: string;
}

// ─── Pokémon list ─────────────────────────────────────────────────────────────
// Fetched from the public GitHub repo at runtime to stay in sync with the
// client data without bundling the full JSON into the function.

async function fetchPokemonList(): Promise<PokemonEntry[]> {
  const url =
    "https://raw.githubusercontent.com/GOPACK3088/whoisthatpokemon/main/src/data/pokemon.json";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch pokemon list: ${res.status} ${res.statusText}`);
  return res.json() as Promise<PokemonEntry[]>;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
// All puzzle dates are in Eastern Time (ET), matching the client's todayKey().

function getETOffset(utcDate: Date): number {
  const year = utcDate.getUTCFullYear();
  // DST: second Sunday in March → first Sunday in November
  const dstStart = new Date(Date.UTC(year, 2, 1));
  dstStart.setUTCDate(1 + ((7 - dstStart.getUTCDay()) % 7) + 7);
  const dstEnd = new Date(Date.UTC(year, 10, 1));
  dstEnd.setUTCDate(1 + ((7 - dstEnd.getUTCDay()) % 7));
  return utcDate >= dstStart && utcDate < dstEnd ? -4 : -5;
}

function toETDateString(utcDate: Date): string {
  const offset = getETOffset(utcDate);
  const et = new Date(utcDate.getTime() + offset * 3_600_000);
  const y = et.getUTCFullYear();
  const m = String(et.getUTCMonth() + 1).padStart(2, "0");
  const d = String(et.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(dateStr: string, days: number): string {
  // Use noon UTC to avoid any DST boundary issues
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Seeded PRNG (xorshift32) ─────────────────────────────────────────────────
// Deterministic shuffle means calling this function twice for the same day
// picks the same Pokémon — safe to re-run without creating duplicates
// (the upsert / existingSet guard handles that, but good for predictability).

function xorshift32(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x1_0000_0000;
  };
}

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  const rand = xorshift32(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Derive a numeric seed from a date string + slot. */
function dateSeed(dateStr: string, slot: "am" | "pm"): number {
  const s = dateStr.replace(/-/g, "") + (slot === "am" ? "0" : "1");
  let h = 2_166_136_261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return h >>> 0;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Optional ?days= param — how many days ahead to schedule (default 7, max 30)
    const reqUrl = new URL(req.url);
    const daysAhead = Math.min(
      30,
      Math.max(1, parseInt(reqUrl.searchParams.get("days") ?? "7", 10) || 7),
    );

    const slots: Array<"am" | "pm"> = ["am", "pm"];

    // ── 1. Build the target date list (ET today + N days) ──────────────────
    const todayET = toETDateString(new Date());
    const targetDates: string[] = Array.from({ length: daysAhead }, (_, i) =>
      addDays(todayET, i),
    );
    const windowEnd = targetDates[targetDates.length - 1];

    console.log(`[generate-puzzles] todayET=${todayET} daysAhead=${daysAhead} windowEnd=${windowEnd}`);

    // ── 2. Which (date, slot) pairs already have a puzzle? ─────────────────
    const { data: existing, error: existErr } = await db
      .from("daily_puzzles")
      .select("puzzle_date, slot")
      .gte("puzzle_date", todayET)
      .lte("puzzle_date", windowEnd);

    if (existErr) throw new Error(`Fetch existing puzzles failed: ${existErr.message}`);

    const existingSet = new Set(
      (existing ?? []).map((r) => `${r.puzzle_date}-${r.slot}`),
    );
    console.log(`[generate-puzzles] ${existingSet.size} slots already scheduled in window`);

    // ── 3. Collect Pokémon used in the last 30 days ────────────────────────
    const thirtyDaysAgo = addDays(todayET, -30);
    const { data: recentRows, error: recentErr } = await db
      .from("daily_puzzles")
      .select("pokemon_id")
      .gte("puzzle_date", thirtyDaysAgo);

    if (recentErr) throw new Error(`Fetch recent puzzles failed: ${recentErr.message}`);

    const recentIds = new Set((recentRows ?? []).map((r) => r.pokemon_id as number));
    console.log(`[generate-puzzles] ${recentIds.size} unique Pokémon used in last 30 days`);

    // ── 4. Load the full Pokémon list and build the eligible pool ──────────
    const allPokemon = await fetchPokemonList();
    const eligible = allPokemon.filter((p) => !recentIds.has(p.id));

    // Safety valve: if history is so dense that fewer than 14 Pokémon are
    // eligible, widen back to the full list to avoid stalling.
    const pool = eligible.length >= daysAhead * slots.length ? eligible : allPokemon;
    console.log(
      `[generate-puzzles] pool=${pool.length} eligible=${eligible.length} total=${allPokemon.length}`,
    );

    // ── 5. Assign one Pokémon per (date, slot) pair ────────────────────────
    // usedThisRun prevents the same Pokémon appearing twice in one generation
    // run, even across am/pm slots of different days.
    const usedThisRun = new Set<number>(recentIds);
    const toInsert: DailyPuzzleRow[] = [];

    for (const date of targetDates) {
      for (const slot of slots) {
        if (existingSet.has(`${date}-${slot}`)) {
          console.log(`[generate-puzzles] skip ${date}-${slot} (already exists)`);
          continue;
        }

        // Deterministic shuffle for this date+slot, then pick first unused
        const shuffled = seededShuffle(pool, dateSeed(date, slot));
        const pick = shuffled.find((p) => !usedThisRun.has(p.id));

        if (!pick) {
          // Extremely unlikely — only happens if pool exhausted mid-run
          console.warn(`[generate-puzzles] no eligible Pokémon for ${date}-${slot}, skipping`);
          continue;
        }

        usedThisRun.add(pick.id);
        toInsert.push({ puzzle_date: date, slot, pokemon_id: pick.id, pokemon_name: pick.name });
        console.log(`[generate-puzzles] ${date}-${slot} → #${pick.id} ${pick.name}`);
      }
    }

    // ── 6. Insert new rows ─────────────────────────────────────────────────
    if (toInsert.length === 0) {
      return json({ message: "All puzzles already scheduled — nothing inserted.", inserted: 0 });
    }

    const { error: insertErr } = await db.from("daily_puzzles").insert(toInsert);
    if (insertErr) throw new Error(`Insert failed: ${insertErr.message}`);

    const summary = toInsert.map((r) => ({
      date: r.puzzle_date,
      slot: r.slot,
      pokemon: `#${r.pokemon_id} ${r.pokemon_name}`,
    }));

    console.log(`[generate-puzzles] inserted ${toInsert.length} rows`);
    return json({ message: "Puzzles generated successfully.", inserted: toInsert.length, puzzles: summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-puzzles] unhandled error:", message);
    return json({ error: message }, 500);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
