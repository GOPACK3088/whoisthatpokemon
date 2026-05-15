import { todayKey, type GuessResult } from "./pokemon";

const STORAGE_KEY = "pokedle-state";

export interface DailyState {
  date: string;
  guesses: number[]; // pokemon ids guessed in order
  finished: boolean;
  won: boolean;
  submitted: boolean; // whether result was synced to server (when signed in)
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
  daily: DailyState | null;
  stats: LocalStats;
}

const defaultStats: LocalStats = {
  currentStreak: 0,
  maxStreak: 0,
  totalPlayed: 0,
  totalWon: 0,
  guessDistribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7": 0 },
  lastPuzzleDate: null,
};

export function loadState(): StoredState {
  if (typeof window === "undefined") return { daily: null, stats: defaultStats };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { daily: null, stats: defaultStats };
    const parsed = JSON.parse(raw) as StoredState;
    return {
      daily: parsed.daily?.date === todayKey() ? parsed.daily : null,
      stats: { ...defaultStats, ...parsed.stats },
    };
  } catch {
    return { daily: null, stats: defaultStats };
  }
}

export function saveState(state: StoredState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
