import pokemonData from "@/data/pokemon.json";

export interface Pokemon {
  id: number;
  name: string;
  types: string[];
  generation: number;
  color: string;
  height: number; // meters
  weight: number; // kg
  stage: number;
  finalStage: number;
  spriteUrl: string;
}

export const POKEMON: Pokemon[] = pokemonData as Pokemon[];
export const POKEMON_BY_NAME = new Map(POKEMON.map((p) => [p.name, p]));
export const MAX_GUESSES = 10;

// ET offset: UTC-5 (EST) or UTC-4 (EDT)
function getETOffset(utcDate: Date): number {
  // DST in ET: second Sunday in March to first Sunday in November
  const year = utcDate.getUTCFullYear();
  // Second Sunday in March
  const dstStart = new Date(Date.UTC(year, 2, 1));
  dstStart.setUTCDate(1 + ((7 - dstStart.getUTCDay()) % 7) + 7);
  // First Sunday in November
  const dstEnd = new Date(Date.UTC(year, 10, 1));
  dstEnd.setUTCDate(1 + ((7 - dstEnd.getUTCDay()) % 7));
  const isDST = utcDate >= dstStart && utcDate < dstEnd;
  return isDST ? -4 : -5;
}

function getETHour(utcDate: Date): number {
  return (utcDate.getUTCHours() + getETOffset(utcDate) + 24) % 24;
}

export function todayKey(): string {
  const now = new Date();
  const offset = getETOffset(now);
  // ET date components
  const etMs = now.getTime() + offset * 3600000;
  const etDate = new Date(etMs);
  const year = etDate.getUTCFullYear();
  const month = String(etDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(etDate.getUTCDate()).padStart(2, "0");
  const etHour = etDate.getUTCHours();
  const slot = etHour >= 8 && etHour < 20 ? "am" : "pm";
  return `${year}-${month}-${day}-${slot}`;
}

// Deterministic hash from date string
function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getDailyPokemon(dateKey: string = todayKey()): Pokemon {
  const idx = hashString(dateKey) % POKEMON.length;
  return POKEMON[idx];
}

export function msUntilNextPuzzle(): number {
  const now = new Date();
  const offset = getETOffset(now);
  const etMs = now.getTime() + offset * 3600000;
  const etDate = new Date(etMs);
  const etHour = etDate.getUTCHours();

  // Next slot is 8am ET if current ET hour < 8 or >= 20, else 8pm ET
  let nextSlotHourET: number;
  let daysAhead = 0;
  if (etHour < 8) {
    nextSlotHourET = 8;
  } else if (etHour < 20) {
    nextSlotHourET = 20;
  } else {
    nextSlotHourET = 8;
    daysAhead = 1;
  }

  const nextET = new Date(Date.UTC(
    etDate.getUTCFullYear(),
    etDate.getUTCMonth(),
    etDate.getUTCDate() + daysAhead,
    nextSlotHourET,
    0,
    0,
  ));
  // Convert back to UTC
  const nextUTC = new Date(nextET.getTime() - offset * 3600000);
  return nextUTC.getTime() - now.getTime();
}

export type Match = "correct" | "partial" | "wrong";
export type Direction = "up" | "down" | "equal";

export interface AttributeResult {
  match: Match;
  direction?: Direction;
}

export interface GuessResult {
  pokemon: Pokemon;
  type1: AttributeResult;
  type2: AttributeResult;
  generation: AttributeResult;
  color: AttributeResult;
  height: AttributeResult;
  weight: AttributeResult;
  stage: AttributeResult;
  isCorrect: boolean;
}

function compareNumber(g: number, a: number, closeWindow: number): AttributeResult {
  if (g === a) return { match: "correct", direction: "equal" };
  const dir: Direction = g < a ? "up" : "down";
  if (Math.abs(g - a) <= closeWindow) return { match: "partial", direction: dir };
  return { match: "wrong", direction: dir };
}

export function compareGuess(guess: Pokemon, answer: Pokemon): GuessResult {
  const gT1 = guess.types[0];
  const gT2 = guess.types[1] ?? null;
  const aT1 = answer.types[0];
  const aT2 = answer.types[1] ?? null;
  const aTypes = answer.types;

  const type1: AttributeResult =
    gT1 === aT1
      ? { match: "correct" }
      : aTypes.includes(gT1)
        ? { match: "partial" }
        : { match: "wrong" };

  let type2: AttributeResult;
  if (!gT2 && !aT2) type2 = { match: "correct" };
  else if (!gT2 || !aT2) type2 = { match: "wrong" };
  else if (gT2 === aT2) type2 = { match: "correct" };
  else if (aTypes.includes(gT2)) type2 = { match: "partial" };
  else type2 = { match: "wrong" };

  return {
    pokemon: guess,
    type1,
    type2,
    generation: compareNumber(guess.generation, answer.generation, 1),
    color: guess.color === answer.color ? { match: "correct" } : { match: "wrong" },
    height: compareNumber(guess.height, answer.height, 1),
    weight: compareNumber(guess.weight, answer.weight, 10),
    stage: compareNumber(guess.stage, answer.stage, 0),
    isCorrect: guess.id === answer.id,
  };
}

export function emojiGrid(results: GuessResult[]): string {
  const cell = (m: Match) => (m === "correct" ? "🟩" : m === "partial" ? "🟨" : "⬛");
  return results
    .map((r) =>
      [r.type1, r.type2, r.generation, r.color, r.height, r.weight, r.stage]
        .map((a) => cell(a.match))
        .join(""),
    )
    .join("\n");
}
