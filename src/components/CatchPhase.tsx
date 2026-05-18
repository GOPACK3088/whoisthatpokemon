import { useEffect, useRef, useState } from "react";
import type { Pokemon } from "@/lib/pokemon";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Move {
  name: string;
  type: string;
  isOptimal: boolean;
  isTrap: boolean;
  effectiveness: "2x2x" | "2x" | "0.5x" | "trap";
}

interface CatchPhaseProps {
  pokemon: Pokemon;
  onCatchComplete: (caught: boolean, moveChosen: string) => void;
}

// ─── Static move pools by type ────────────────────────────────────────────────

const MOVES_BY_TYPE: Record<string, string[]> = {
  fire:     ["Flamethrower", "Fire Blast", "Overheat", "Ember", "Heat Wave"],
  water:    ["Surf", "Hydro Pump", "Scald", "Aqua Tail", "Water Pulse"],
  grass:    ["Energy Ball", "Leaf Storm", "Giga Drain", "Solar Beam", "Razor Leaf"],
  electric: ["Thunderbolt", "Thunder", "Discharge", "Volt Switch", "Spark"],
  ice:      ["Ice Beam", "Blizzard", "Freeze-Dry", "Ice Punch", "Powder Snow"],
  fighting: ["Close Combat", "Aura Sphere", "Superpower", "Brick Break", "Low Kick"],
  poison:   ["Sludge Bomb", "Gunk Shot", "Poison Jab", "Venoshock", "Clear Smog"],
  ground:   ["Earthquake", "Earth Power", "Dig", "Bulldoze", "Mud Shot"],
  flying:   ["Air Slash", "Hurricane", "Acrobatics", "Brave Bird", "Wing Attack"],
  psychic:  ["Psychic", "Psyshock", "Future Sight", "Zen Headbutt", "Stored Power"],
  bug:      ["Bug Buzz", "X-Scissor", "Leech Life", "Signal Beam", "Pin Missile"],
  rock:     ["Stone Edge", "Rock Slide", "Power Gem", "Ancient Power", "Smack Down"],
  ghost:    ["Shadow Ball", "Hex", "Shadow Claw", "Phantom Force", "Night Shade"],
  dragon:   ["Draco Meteor", "Dragon Pulse", "Outrage", "Dragon Claw", "Twister"],
  dark:     ["Dark Pulse", "Crunch", "Knock Off", "Night Daze", "Snarl"],
  steel:    ["Iron Head", "Flash Cannon", "Meteor Mash", "Iron Tail", "Steel Wing"],
  fairy:    ["Moonblast", "Dazzling Gleam", "Play Rough", "Draining Kiss", "Charm"],
  normal:   ["Hyper Beam", "Body Slam", "Double-Edge", "Return", "Facade"],
};

const STATUS_TRAPS: { name: string; type: string }[] = [
  { name: "Thunder Wave", type: "electric" },
  { name: "Will-O-Wisp",  type: "fire" },
  { name: "Toxic",        type: "poison" },
  { name: "Spore",        type: "grass" },
  { name: "Glare",        type: "normal" },
  { name: "Hypnosis",     type: "psychic" },
  { name: "Stun Spore",   type: "grass" },
  { name: "Sing",         type: "normal" },
];

// ─── PokéAPI helpers ──────────────────────────────────────────────────────────

async function fetchWeaknesses(types: string[]): Promise<string[]> {
  const results = await Promise.all(
    types.map((t) =>
      fetch(`https://pokeapi.co/api/v2/type/${t.toLowerCase()}`)
        .then((r) => r.json())
        .then((d) => d.damage_relations.double_damage_from.map((x: { name: string }) => x.name) as string[])
    )
  );
  return results.flat();
}

// ─── Move generation ──────────────────────────────────────────────────────────

function pickRandom<T>(arr: T[], exclude: T[] = []): T {
  const pool = arr.filter((x) => !exclude.includes(x));
  return pool[Math.floor(Math.random() * pool.length)];
}

function getMoveName(type: string, exclude: string[]): string {
  const pool = MOVES_BY_TYPE[type] ?? MOVES_BY_TYPE["normal"];
  const available = pool.filter((m) => !exclude.includes(m));
  return available[Math.floor(Math.random() * available.length)] ?? pool[0];
}

function generateMoves(pokemonTypes: string[], weaknesses: string[]): Move[] {
  const used: string[] = [];
  const moves: Move[] = [];

  const allWeakSet: Record<string, number> = {};
  for (const w of weaknesses) allWeakSet[w] = (allWeakSet[w] ?? 0) + 1;

  const doubleWeakTypes = Object.entries(allWeakSet)
    .filter(([, count]) => count >= 2)
    .map(([t]) => t);

  // 1. Optimal: super effective vs both types (double-weak preferred)
  let optimalType: string;
  if (doubleWeakTypes.length > 0) {
    optimalType = pickRandom(doubleWeakTypes);
  } else if (weaknesses.length > 0) {
    optimalType = pickRandom(weaknesses);
  } else {
    optimalType = "normal";
  }

  const optimalName = getMoveName(optimalType, used);
  used.push(optimalName);
  moves.push({
    name: optimalName,
    type: optimalType,
    isOptimal: true,
    isTrap: false,
    effectiveness: doubleWeakTypes.includes(optimalType) ? "2x2x" : "2x",
  });

  // 2. Trap: status move, preferring one whose type matches a weakness
  const trapCandidates = STATUS_TRAPS.filter((s) => weaknesses.includes(s.type));
  const trap =
    trapCandidates.length > 0
      ? trapCandidates[Math.floor(Math.random() * trapCandidates.length)]
      : STATUS_TRAPS[Math.floor(Math.random() * STATUS_TRAPS.length)];
  used.push(trap.name);
  moves.push({
    name: trap.name,
    type: trap.type,
    isOptimal: false,
    isTrap: true,
    effectiveness: "trap",
  });

  // 3. Partial: super effective vs only one type
  const singleWeakTypes = weaknesses.filter(
    (w) => (allWeakSet[w] ?? 0) < 2 && w !== optimalType
  );
  const partialType =
    singleWeakTypes.length > 0
      ? pickRandom(singleWeakTypes, [optimalType])
      : pokemonTypes[0];
  const partialName = getMoveName(partialType, used);
  used.push(partialName);
  moves.push({
    name: partialName,
    type: partialType,
    isOptimal: false,
    isTrap: false,
    effectiveness: "2x",
  });

  // 4. Not very effective: move of the pokemon's own type (often resisted)
  const resistedType = pokemonTypes[Math.floor(Math.random() * pokemonTypes.length)];
  const resistedName = getMoveName(resistedType, used);
  used.push(resistedName);
  moves.push({
    name: resistedName,
    type: resistedType,
    isOptimal: false,
    isTrap: false,
    effectiveness: "0.5x",
  });

  // Shuffle
  return moves.sort(() => Math.random() - 0.5);
}

// ─── Type badge colors ────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  fire:     "bg-orange-500",
  water:    "bg-blue-500",
  grass:    "bg-green-600",
  electric: "bg-yellow-400 text-black",
  ice:      "bg-cyan-400 text-black",
  fighting: "bg-red-700",
  poison:   "bg-purple-600",
  ground:   "bg-amber-600",
  flying:   "bg-indigo-400",
  psychic:  "bg-pink-500",
  bug:      "bg-lime-600",
  rock:     "bg-stone-500",
  ghost:    "bg-violet-700",
  dragon:   "bg-indigo-700",
  dark:     "bg-neutral-700",
  steel:    "bg-slate-500",
  fairy:    "bg-pink-400 text-black",
  normal:   "bg-neutral-400 text-black",
};

function typeColor(type: string) {
  return TYPE_COLORS[type.toLowerCase()] ?? "bg-neutral-500";
}

// ─── Pokeball SVG ─────────────────────────────────────────────────────────────

function Pokeball() {
  return (
    <div
      className="w-24 h-24 mx-auto"
      style={{ filter: "drop-shadow(0 4px 24px rgba(220,38,38,0.4))" }}
    >
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <path d="M10,50 A40,40 0 0,1 90,50 Z" fill="#dc2626" />
        <path d="M10,50 A40,40 0 0,0 90,50 Z" fill="white" />
        <circle cx="50" cy="50" r="40" fill="none" stroke="#1a1a1a" strokeWidth="4" />
        <rect x="10" y="46" width="80" height="8" fill="#1a1a1a" />
        <circle cx="50" cy="50" r="12" fill="#1a1a1a" />
        <circle cx="50" cy="50" r="8" fill="white" />
        <circle cx="47" cy="47" r="2.5" fill="rgba(255,255,255,0.7)" />
      </svg>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const CATCH_TIMER = 7;

type Phase =
  | "loading"
  | "choosing"
  | "wiggling"
  | "caught"
  | "failed_time"
  | "failed_wrong";

export function CatchPhase({ pokemon, onCatchComplete }: CatchPhaseProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [moves, setMoves] = useState<Move[]>([]);
  const [timeLeft, setTimeLeft] = useState(CATCH_TIMER);
  const [chosenMove, setChosenMove] = useState<Move | null>(null);
  const [wiggleCount, setWiggleCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wiggleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Scroll into view on mount
  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Fetch weaknesses and generate moves
  useEffect(() => {
    let cancelled = false;
    fetchWeaknesses(pokemon.types)
      .then((weaknesses) => {
        if (cancelled) return;
        setMoves(generateMoves(pokemon.types, weaknesses));
        setPhase("choosing");
      })
      .catch(() => {
        if (cancelled) return;
        setMoves(generateMoves(pokemon.types, []));
        setPhase("choosing");
      });
    return () => { cancelled = true; };
  }, [pokemon]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "choosing") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current!);
          setPhase("failed_time");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [phase]);

  // Pokeball wiggle sequence — 3 wiggles then caught
  useEffect(() => {
    if (phase !== "wiggling") return;
    let count = 0;
    function doWiggle() {
      count++;
      setWiggleCount(count);
      if (count < 3) {
        wiggleRef.current = setTimeout(doWiggle, 900);
      } else {
        wiggleRef.current = setTimeout(() => setPhase("caught"), 900);
      }
    }
    wiggleRef.current = setTimeout(doWiggle, 200);
    return () => clearTimeout(wiggleRef.current!);
  }, [phase]);

  // Notify parent when terminal phase reached
  useEffect(() => {
    if (phase === "caught") {
      const t = setTimeout(() => onCatchComplete(true, chosenMove?.name ?? ""), 2200);
      return () => clearTimeout(t);
    }
    if (phase === "failed_time") {
      const t = setTimeout(() => onCatchComplete(false, ""), 2200);
      return () => clearTimeout(t);
    }
    if (phase === "failed_wrong") {
      const t = setTimeout(() => onCatchComplete(false, chosenMove?.name ?? ""), 2200);
      return () => clearTimeout(t);
    }
  }, [phase, chosenMove, onCatchComplete]);

  function handleMoveClick(move: Move) {
    if (phase !== "choosing") return;
    clearInterval(timerRef.current!);
    setChosenMove(move);
    if (move.isOptimal) {
      setWiggleCount(0);
      setPhase("wiggling");
    } else {
      setPhase("failed_wrong");
    }
  }

  // ── Render (single wrapper so ref is always attached) ────────────────────

  const timerPct = (timeLeft / CATCH_TIMER) * 100;
  const timerColor =
    timeLeft > 4
      ? "bg-[var(--tile-correct)]"
      : timeLeft > 2
      ? "bg-[var(--tile-partial)]"
      : "bg-[var(--tile-wrong)]";

  return (
    <div ref={containerRef}>

      {/* Loading */}
      {phase === "loading" && (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <div className="w-8 h-8 border-2 border-border border-t-[var(--tile-correct)] rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">A wild Pokémon appeared…</p>
        </div>
      )}

      {/* Caught */}
      {phase === "caught" && (
        <div className="flex flex-col items-center justify-center py-10 space-y-5 animate-fade-in">
          <div className="text-5xl animate-bounce">🎉</div>
          <Pokeball />
          <div className="text-center space-y-1">
            <p className="text-3xl font-bold tracking-tight text-[var(--tile-correct)]">
              Gotcha!
            </p>
            <p className="text-muted-foreground capitalize">
              {pokemon.name.replace(/-/g, " ")} was caught!
            </p>
          </div>
          <div className="rounded-full px-3 py-1 bg-[var(--tile-correct)] text-[var(--tile-correct-foreground)] text-xs font-medium">
            {chosenMove?.name}
          </div>
        </div>
      )}

      {/* Failed: time ran out */}
      {phase === "failed_time" && (
        <div className="flex flex-col items-center justify-center py-10 space-y-5">
          <img
            src={pokemon.spriteUrl}
            alt={pokemon.name}
            className="w-32 h-32 object-contain opacity-40 grayscale"
          />
          <div className="text-center space-y-1">
            <p className="text-2xl font-bold text-[var(--tile-wrong)]">It fled!</p>
            <p className="text-sm text-muted-foreground">You hesitated too long…</p>
          </div>
        </div>
      )}

      {/* Failed: wrong move */}
      {phase === "failed_wrong" && (
        <div className="flex flex-col items-center justify-center py-10 space-y-5">
          <img
            src={pokemon.spriteUrl}
            alt={pokemon.name}
            className="w-32 h-32 object-contain opacity-40 grayscale"
          />
          <div className="text-center space-y-2">
            <p className="text-2xl font-bold text-[var(--tile-wrong)]">It broke free!</p>
            <p className="text-sm text-muted-foreground">
              {chosenMove?.isTrap
                ? `${chosenMove.name} did nothing — it's a status move!`
                : `${chosenMove?.name} wasn't very effective…`}
            </p>
          </div>
        </div>
      )}

      {/* Wiggling */}
      {phase === "wiggling" && (
        <div className="flex flex-col items-center justify-center py-10 space-y-6">
          <p className="text-sm text-muted-foreground font-medium tracking-wide uppercase">
            Gotcha? Gotcha? Gotcha?
          </p>
          <div
            key={wiggleCount}
            style={{ animation: "pokeball-wiggle 0.8s ease-in-out" }}
          >
            <Pokeball />
          </div>
          <p className="text-sm text-muted-foreground">{chosenMove?.name}</p>
        </div>
      )}

      {/* Choosing */}
      {phase === "choosing" && (
        <div className="flex flex-col items-center space-y-5 py-4">
          <div className="text-center space-y-0.5">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
              A wild Pokémon appeared!
            </p>
            <p className="text-sm text-muted-foreground">
              Choose the right move to catch it
            </p>
          </div>

          {/* Pokemon image only — no name, no types */}
          <img
            src={pokemon.spriteUrl}
            alt="Wild Pokémon"
            className="w-36 h-36 object-contain"
            style={{ imageRendering: "pixelated" }}
          />

          {/* Countdown timer */}
          <div className="w-full space-y-1.5">
            <div className="flex justify-between items-center text-xs text-muted-foreground px-0.5">
              <span>Time remaining</span>
              <span
                className={`font-mono font-bold tabular-nums text-sm ${
                  timeLeft <= 2 ? "text-[var(--tile-wrong)]" : "text-foreground"
                }`}
              >
                {timeLeft}s
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ease-linear ${timerColor}`}
                style={{ width: `${timerPct}%` }}
              />
            </div>
          </div>

          {/* Move buttons */}
          <div className="grid grid-cols-2 gap-2 w-full">
            {moves.map((move) => (
              <button
                key={move.name}
                onClick={() => handleMoveClick(move)}
                className="
                  flex flex-col items-start gap-1 rounded-md border border-border
                  bg-card hover:bg-accent active:scale-95
                  px-3 py-2.5 text-left transition-all duration-100
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                "
              >
                <span className="font-semibold text-sm leading-tight">{move.name}</span>
                <span
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wide text-white ${typeColor(move.type)}`}
                >
                  {move.type}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}