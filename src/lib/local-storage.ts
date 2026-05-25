import { type GameMode } from "./pokemon";

const STORAGE_KEY = "pokedle-state-v2";

export interface DailyState {
  date: string;        // todayKey() — "YYYY-MM-DD-slot"
  mode: GameMode;
  guesses: number[];   // pokemon ids guessed in order
  finished: boolean;
  won: boolean;
  submitted: boolean;  // whether result was synced to server
  catchResult?: { caught: boolean; moveChosen: string } | null;
  hint1Used?: boolean;
  hint2Used?: boolean;
  hint1Value?: string | null;
  hint2Value?: string | null;
}

export interface LocalStats {
  currentStreak: number;
  maxStreak: number;
  totalPlayed: number;
  totalWon: number;
  guessDistribution: Record<string, number>;
  lastPuzzleDate: string | null;
}

export interface StoredState {
  // Keyed by "date-mode", e.g. "2026-05-24-am-classic" or "2026-05-24-am-retro"
  dailyByKey: Record<string, DailyState>;
  // Stats are per-mode
  statsByMode: Record<GameMode, LocalStats>;
  // Legacy field — kept for migration, ignored after first read
  daily?: unknown;
  stats?: unknown;
}

const defaultStats = (): LocalStats => ({
  currentStreak: 0,
  maxStreak: 0,
  totalPlayed: 0,
  totalWon: 0,
  guessDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0, "8": 0, "9": 0, "10": 0 },
  lastPuzzleDate: null,
});

function defaultStoredState(): StoredState {
  return {
    dailyByKey: {},
    statsByMode: { classic: defaultStats(), retro: defaultStats() },
  };
}

/** Compose the localStorage key for a given date key + mode. */
export function dailyStateKey(dateKey: string, mode: GameMode): string {
  return `${dateKey}-${mode}`;
}

function loadRaw(): StoredState {
  if (typeof window === "undefined") return defaultStoredState();
  try {
    // Try the current versioned key first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredState>;
      const state = defaultStoredState();
      if (parsed.dailyByKey) state.dailyByKey = parsed.dailyByKey;
      if (parsed.statsByMode) {
        state.statsByMode = {
          classic: { ...defaultStats(), ...parsed.statsByMode.classic },
          retro:   { ...defaultStats(), ...parsed.statsByMode.retro },
        };
      }
      return state;
    }

    // No v2 key yet — migrate Classic data from old key, Retro starts fresh
    const state = defaultStoredState();
    const legacy = localStorage.getItem("pokedle-state");
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<StoredState>;

      // Migrate old single daily slot (pre-mode era)
      if (parsed.daily && typeof parsed.daily === "object") {
        const d = parsed.daily as DailyState & { mode?: GameMode };
        // Only migrate if it was classic (or untagged — assumed classic)
        if (!d.mode || d.mode === "classic") {
          const k = dailyStateKey(d.date, "classic");
          state.dailyByKey[k] = { ...d, mode: "classic" };
        }
      }

      // Migrate dailyByKey but only classic entries
      if (parsed.dailyByKey) {
        for (const [k, v] of Object.entries(parsed.dailyByKey)) {
          if (k.endsWith("-classic")) {
            state.dailyByKey[k] = v as DailyState;
          }
          // Retro entries from old storage are intentionally dropped
        }
      }

      // Migrate classic stats only
      if (parsed.statsByMode?.classic) {
        state.statsByMode.classic = { ...defaultStats(), ...parsed.statsByMode.classic };
      } else if (parsed.stats && typeof parsed.stats === "object") {
        state.statsByMode.classic = { ...defaultStats(), ...(parsed.stats as LocalStats) };
      }
      // Retro stats start at zero — not migrated
    }

    return state;
  } catch {
    return defaultStoredState();
  }
}

/** Load the daily state for a specific date key + mode. Returns null if not found. */
export function loadDailyState(dateKey: string, mode: GameMode): DailyState | null {
  const raw = loadRaw();
  return raw.dailyByKey[dailyStateKey(dateKey, mode)] ?? null;
}

/** Load stats for a specific mode. */
export function loadStats(mode: GameMode): LocalStats {
  const raw = loadRaw();
  return raw.statsByMode[mode] ?? defaultStats();
}

/** Save/update daily state for a specific date key + mode. */
export function saveDailyState(dateKey: string, mode: GameMode, daily: DailyState): void {
  if (typeof window === "undefined") return;
  const raw = loadRaw();
  raw.dailyByKey[dailyStateKey(dateKey, mode)] = daily;
  // Prune stale entries older than 3 days to keep storage lean
  const threeDaysAgo = Date.now() - 3 * 86_400_000;
  for (const k of Object.keys(raw.dailyByKey)) {
    // Key format: "YYYY-MM-DD-slot-mode" — date is the first 10 chars
    const datePart = k.slice(0, 10);
    if (new Date(datePart + "T12:00:00Z").getTime() < threeDaysAgo) {
      delete raw.dailyByKey[k];
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

/** Save/update stats for a specific mode. */
export function saveStats(mode: GameMode, stats: LocalStats): void {
  if (typeof window === "undefined") return;
  const raw = loadRaw();
  raw.statsByMode[mode] = stats;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

// ─── Legacy compat exports (used in profile page etc.) ───────────────────────
// These read/write the classic-mode state to maintain backwards compatibility
// with any code that hasn't been updated yet.

export function loadState() {
  const raw = loadRaw();
  return {
    daily: null as DailyState | null, // not meaningful without mode — use loadDailyState
    stats: raw.statsByMode.classic,
  };
}

export function saveState(_state: { daily: unknown; stats: LocalStats }) {
  // no-op shim — callers should use saveDailyState/saveStats directly
}

function isYesterday(prev: string, today: string): boolean {
  const p = new Date(prev + "T00:00:00Z");
  const t = new Date(today + "T00:00:00Z");
  return t.getTime() - p.getTime() === 86400000;
}

export function applyResultToStats(
  stats: LocalStats,
  won: boolean,
  guesses: number,
  date: string,
): LocalStats {
  const next = { ...stats, guessDistribution: { ...stats.guessDistribution } };
  next.totalPlayed += 1;
  if (won) {
    next.totalWon += 1;
    next.guessDistribution[String(guesses)] = (next.guessDistribution[String(guesses)] ?? 0) + 1;
    if (next.lastPuzzleDate && isYesterday(next.lastPuzzleDate, date)) {
      next.currentStreak += 1;
    } else {
      next.currentStreak = 1;
    }
    next.maxStreak = Math.max(next.maxStreak, next.currentStreak);
  } else {
    next.currentStreak = 0;
  }
  next.lastPuzzleDate = date;
  return next;
}
