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

export function todayKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
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
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return next.getTime() - now.getTime();
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
