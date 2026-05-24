import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  POKEMON_BY_NAME,
  compareGuess,
  emojiGrid,
  getDailyPokemon,
  fetchDailyPokemon,
  splitKey,
  MAX_GUESSES,
  msUntilNextPuzzle,
  todayKey,
  type Pokemon,
} from "@/lib/pokemon";
import { applyResultToStats, loadState, saveState } from "@/lib/local-storage";
import { GuessRow } from "@/components/GuessRow";
import { GuessInput } from "@/components/GuessInput";
import { CatchPhase } from "@/components/CatchPhase";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { submitDailyResult } from "@/lib/results.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: GamePage,
  head: () => ({
    meta: [{ title: "PokéCatch — Daily Pokémon Guessing Game" }],
  }),
});

// ─── Countdown ────────────────────────────────────────────────────────────────

function Countdown() {
  const [ms, setMs] = useState(msUntilNextPuzzle());
  useEffect(() => {
    const i = setInterval(() => setMs(msUntilNextPuzzle()), 1000);
    return () => clearInterval(i);
  }, []);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return (
    <span className="font-mono tabular-nums">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}

// ─── Welcome modal ────────────────────────────────────────────────────────────

function WelcomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="text-center space-y-1">
          <div className="text-4xl">🎮</div>
          <h2 className="text-xl font-bold text-white">How to Play PokéCatch</h2>
          <p className="text-sm text-zinc-400">Two phases, one mystery Pokémon.</p>
        </div>
        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-400 font-bold text-sm">
              1
            </div>
            <div>
              <div className="font-semibold text-white text-sm">Guess the Pokémon</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                You get {MAX_GUESSES} guesses. After each one, a color-coded grid reveals how close
                you are across 7 attributes — type, generation, color, height, weight, and evolution
                stage.
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-sm">
              2
            </div>
            <div>
              <div className="font-semibold text-white text-sm">Catch it with the right move</div>
              <div className="text-xs text-zinc-400 mt-0.5">
                Once you identify the Pokémon, you enter the catch phase. Pick the right move to
                successfully catch it — type matchups matter!
              </div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 items-start rounded-xl bg-zinc-800 border border-zinc-700 p-3">
          <div className="text-2xl">🏆</div>
          <div className="text-xs text-zinc-300">
            <span className="font-semibold text-white">Track your progress.</span>{" "}
            <Link
              to="/login"
              className="text-yellow-400 underline underline-offset-2 hover:text-yellow-300"
            >
              Sign up for free
            </Link>{" "}
            to save your streak, build your personal Pokédex, and compete on the leaderboard.
          </div>
        </div>
        <Button className="w-full" onClick={onClose}>
          Let's go! 🚀
        </Button>
      </div>
    </div>
  );
}

// ─── Hint bar ─────────────────────────────────────────────────────────────────

interface HintBarProps {
  guessCount: number;
  hint1Used: boolean;
  hint2Used: boolean;
  hint1Value: string | null;
  hint2Value: string | null;
  hint2Loading: boolean;
  onUseHint1: () => void;
  onUseHint2: () => void;
}

function HintBar({
  guessCount,
  hint1Used,
  hint2Used,
  hint1Value,
  hint2Value,
  hint2Loading,
  onUseHint1,
  onUseHint2,
}: HintBarProps) {
  const showHint1 = guessCount >= 5;
  const showHint2 = guessCount >= 9;
  if (!showHint1 && !showHint2) return null;
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {showHint1 &&
        (hint1Used ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-1.5 text-sm">
            <span className="text-yellow-400">💡</span>
            <span className="text-yellow-300 font-medium">Gen {hint1Value}</span>
            <span className="text-zinc-500 text-xs ml-1">generation</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 hover:text-yellow-300"
            onClick={onUseHint1}
          >
            💡 Hint 1 — Generation
          </Button>
        ))}
      {showHint2 &&
        (hint2Used ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-sm">
            <span className="text-blue-400">🌿</span>
            <span className="text-blue-300 font-medium capitalize">
              {hint2Loading ? "Loading…" : (hint2Value ?? "Unknown")}
            </span>
            <span className="text-zinc-500 text-xs ml-1">habitat</span>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-500/40 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
            onClick={onUseHint2}
          >
            🌿 Hint 2 — Habitat
          </Button>
        ))}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
// splitKey is imported from @/lib/pokemon — no local duplicate needed.

// ─── Game page ────────────────────────────────────────────────────────────────

function GamePage() {
  const key = todayKey();                              // e.g. "2026-05-23-am"
  const { puzzleDate, slot } = splitKey(key);          // "2026-05-23", "am"
  // Start with the fast hash-based answer immediately so the UI isn't blank,
  // then replace it if the daily_puzzles table has an override for today.
  const [answer, setAnswer] = useState<Pokemon>(() => getDailyPokemon(key));
  const { user, loading: authLoading } = useAuth();
  const submitFn = useServerFn(submitDailyResult);

  // Async lookup: replace hash answer with DB-scheduled one if available
  useEffect(() => {
    let cancelled = false;
    fetchDailyPokemon(key).then((p) => {
      if (!cancelled) setAnswer(p);
    });
    return () => { cancelled = true; };
  }, [key]);

  const [guessIds, setGuessIds] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  // submitted tracks server sync for the current session.
  // Deliberately NOT pre-seeded from localStorage so that if a user finishes
  // the puzzle while logged out then signs in, the sync still fires.
  const [submitted, setSubmitted] = useState(false);
  const [catchPhaseActive, setCatchPhaseActive] = useState(false);
  const [catchResult, setCatchResult] = useState<{ caught: boolean; moveChosen: string } | null>(
    null,
  );
  const [showWelcome, setShowWelcome] = useState(false);

  // Hint state
  const [hint1Used, setHint1Used] = useState(false);
  const [hint2Used, setHint2Used] = useState(false);
  const [hint1Value, setHint1Value] = useState<string | null>(null);
  const [hint2Value, setHint2Value] = useState<string | null>(null);
  const [hint2Loading, setHint2Loading] = useState(false);

  // Show welcome modal on first ever visit
  useEffect(() => {
    if (!localStorage.getItem("pokecatch_welcomed")) setShowWelcome(true);
  }, []);

  function dismissWelcome() {
    localStorage.setItem("pokecatch_welcomed", "1");
    setShowWelcome(false);
  }

  // Hydrate game state from localStorage on mount.
  // Note: `submitted` is intentionally NOT restored here — see comment above.
  useEffect(() => {
    const { daily } = loadState();
    if (daily && daily.date === key) {
      const d = daily as typeof daily & {
        catchResult?: { caught: boolean; moveChosen: string };
        hint1Used?: boolean;
        hint2Used?: boolean;
        hint1Value?: string | null;
        hint2Value?: string | null;
      };
      setGuessIds(d.guesses);
      setFinished(d.finished);
      setWon(d.won);
      // Do NOT set submitted here — let the sync effect decide based on live auth state
      if (d.finished && d.won) setCatchResult(d.catchResult ?? { caught: false, moveChosen: "" });
      if (d.hint1Used) { setHint1Used(true); setHint1Value(d.hint1Value ?? null); }
      if (d.hint2Used) { setHint2Used(true); setHint2Value(d.hint2Value ?? null); }
    }
  }, [key]);

  const guesses = useMemo(
    () =>
      guessIds
        .map((id) => POKEMON_BY_NAME.get(getNameById(id)))
        .filter((p): p is Pokemon => !!p),
    [guessIds],
  );
  const results = useMemo(() => guesses.map((g) => compareGuess(g, answer)), [guesses, answer]);

  // Sync result to server once auth resolves and game is finished.
  // `submitted` is session-only (never seeded from localStorage) so this fires
  // correctly even when the user signs in after completing the puzzle.
  useEffect(() => {
    if (authLoading) return;            // wait for auth to resolve
    if (!finished) return;              // game not done yet
    if (submitted) return;              // already synced this session
    if (!user) return;                  // not signed in

    submitFn({ data: { puzzleDate, slot, guessesUsed: guessIds.length, won } })
      .then(() => {
        setSubmitted(true);
        // Mark submitted in localStorage so a hard refresh doesn't double-submit
        const state = loadState();
        if (state.daily) { state.daily.submitted = true; saveState(state); }
        console.log("[index] submitDailyResult succeeded");
      })
      .catch((e) => {
        console.error("[index] submitDailyResult failed:", e);
        toast.error("Failed to save result to server — will retry on next load.");
      });
  }, [authLoading, finished, submitted, user, submitFn, puzzleDate, slot, guessIds.length, won]);

  // ── Hint helpers ──────────────────────────────────────────────────────────

  function persistHints(
    h1Used: boolean,
    h1Val: string | null,
    h2Used: boolean,
    h2Val: string | null,
  ) {
    const state = loadState();
    if (state.daily) {
      Object.assign(state.daily, {
        hint1Used: h1Used,
        hint1Value: h1Val,
        hint2Used: h2Used,
        hint2Value: h2Val,
      });
      saveState(state);
    }
  }

  function handleUseHint1() {
    const val = String(answer.generation);
    setHint1Used(true);
    setHint1Value(val);
    persistHints(true, val, hint2Used, hint2Value);
  }

  async function handleUseHint2() {
    setHint2Used(true);
    setHint2Loading(true);
    let habitat: string | null = null;
    try {
      const res = await fetch(
        `https://pokeapi.co/api/v2/pokemon-species/${answer.name.toLowerCase()}/`,
      );
      if (res.ok) {
        const data = await res.json();
        habitat = data.habitat?.name ?? null;
      }
    } catch {
      habitat = null;
    }
    setHint2Value(habitat);
    setHint2Loading(false);
    persistHints(hint1Used, hint1Value, true, habitat);
  }

  // ── Guess handler ─────────────────────────────────────────────────────────

  function handleGuess(p: Pokemon) {
    if (finished) return;
    const newIds = [...guessIds, p.id];
    const isWin = p.id === answer.id;
    const isDone = isWin || newIds.length >= MAX_GUESSES;
    setGuessIds(newIds);
    if (isDone) { setFinished(true); setWon(isWin); if (isWin) setCatchPhaseActive(true); }
    const state = loadState();
    const daily = Object.assign(
      { date: key, guesses: newIds, finished: isDone, won: isWin, submitted: false, catchResult: null },
      { hint1Used, hint1Value, hint2Used, hint2Value },
    );
    const stats = isDone
      ? applyResultToStats(state.stats, isWin, newIds.length, puzzleDate)
      : state.stats;
    saveState({ daily, stats });
  }

  // ── Catch complete ────────────────────────────────────────────────────────

  async function handleCatchComplete(caught: boolean, moveChosen: string) {
    const result = { caught, moveChosen };
    setCatchResult(result);
    setCatchPhaseActive(false);
    const state = loadState();
    if (state.daily) { Object.assign(state.daily, { catchResult: result }); saveState(state); }

    if (user) {
      // Always record the catch attempt regardless of outcome
      const { error: catchResultErr } = await supabase.from("catch_results").insert({
        user_id: user.id,
        puzzle_date: puzzleDate,
        slot,
        caught,
        move_chosen: moveChosen || null,
      });
      if (catchResultErr) console.error("[index] Failed to save catch result:", catchResultErr);

      // Only upsert into caught_pokemon Pokédex if they actually caught it
      if (caught) {
        const { error: caughtErr } = await supabase.from("caught_pokemon").upsert(
          {
            user_id: user.id,
            pokemon_id: answer.id,
            pokemon_name: answer.name,
            caught_at: new Date().toISOString(),
          },
          { onConflict: "user_id,pokemon_id" },
        );
        if (caughtErr) console.error("[index] Failed to save caught Pokémon:", caughtErr);
      }
    }
  }

  // ── Share ─────────────────────────────────────────────────────────────────

  function handleShare() {
    const grid = emojiGrid(results);
    const score = won ? `${guessIds.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const catchLine = catchResult
      ? catchResult.caught
        ? `🎯 Caught with ${catchResult.moveChosen}!`
        : `💨 It got away…`
      : "";
    const text = `PokéCatch ${puzzleDate} ${slot.toUpperCase()} ${score}\n\n${grid}${catchLine ? `\n\n${catchLine}` : ""}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    }
  }

  const empties = finished ? 0 : Math.min(3, MAX_GUESSES - guesses.length);

  // ── Catch phase: full-screen takeover ─────────────────────────────────────

  if (catchPhaseActive && won) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        {showWelcome && <WelcomeModal onClose={dismissWelcome} />}
        <div className="rounded-xl border border-border bg-card p-6">
          <CatchPhase pokemon={answer} onCatchComplete={handleCatchComplete} />
        </div>
      </div>
    );
  }

  // ── Normal game view ──────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      {showWelcome && <WelcomeModal onClose={dismissWelcome} />}

      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-white">Daily PokéCatch</h1>
        <p className="text-sm text-muted-foreground">
          Guess the mystery Pokémon in {MAX_GUESSES} tries. New puzzle in <Countdown />
        </p>
      </div>

      {!finished && (
        <GuessInput onGuess={handleGuess} excludeIds={guessIds} disabled={finished} />
      )}

      {!finished && (
        <HintBar
          guessCount={guessIds.length}
          hint1Used={hint1Used}
          hint2Used={hint2Used}
          hint1Value={hint1Value}
          hint2Value={hint2Value}
          hint2Loading={hint2Loading}
          onUseHint1={handleUseHint1}
          onUseHint2={handleUseHint2}
        />
      )}

      <div className="space-y-2">
        {[...results].reverse().map((r, i) => (
          <GuessRow key={i} result={r} />
        ))}
        {!finished &&
          Array.from({ length: empties }).map((_, i) => (
            <div key={`e-${i}`} className="space-y-1.5">
              <div className="h-10" />
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }).map((_, j) => (
                  <div
                    key={j}
                    className="rounded-md border border-dashed border-border min-h-[56px]"
                  />
                ))}
              </div>
            </div>
          ))}
      </div>

      {finished && !catchPhaseActive && (
        <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <img
            src={answer.spriteUrl}
            alt={answer.name}
            className="w-32 h-32 mx-auto object-contain"
          />
          <div>
            <div className="text-sm text-muted-foreground uppercase tracking-wide">
              {won ? "You got it!" : "Today's Pokémon was"}
            </div>
            <div className="text-2xl font-bold capitalize text-white">
              {answer.name.replace(/-/g, " ")}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {won ? `Solved in ${guessIds.length}/${MAX_GUESSES}` : `Better luck tomorrow!`}
            </div>
          </div>
          {won && catchResult && (
            <div className="rounded-lg bg-muted px-4 py-2 text-sm">
              {catchResult.caught ? (
                <span className="text-[var(--tile-correct)] font-medium">
                  🎯 Caught with {catchResult.moveChosen}!
                </span>
              ) : (
                <span className="text-muted-foreground">💨 It got away…</span>
              )}
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Button onClick={handleShare}>Share result</Button>
          </div>
          {!user && (
            <p className="text-xs text-muted-foreground pt-2">
              Sign in to track your streak and join the leaderboard.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

import { POKEMON } from "@/lib/pokemon";
const ID_TO_NAME = new Map(POKEMON.map((p) => [p.id, p.name]));
function getNameById(id: number): string {
  return ID_TO_NAME.get(id) ?? "";
}
