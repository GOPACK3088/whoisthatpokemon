import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  POKEMON_BY_NAME,
  compareGuess,
  emojiGrid,
  getDailyPokemon,
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
    meta: [
      { title: "PokéCatch — Daily Pokémon Guessing Game" },
    ],
  }),
});

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
            <div className="shrink-0 w-8 h-8 rounded-full bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-yellow-400 font-bold text-sm">1</div>
            <div>
              <div className="font-semibold text-white text-sm">Guess the Pokémon</div>
              <div className="text-xs text-zinc-400 mt-0.5">You get {MAX_GUESSES} guesses. After each one, a color-coded grid reveals how close you are across 7 attributes — type, generation, color, height, weight, and evolution stage.</div>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 font-bold text-sm">2</div>
            <div>
              <div className="font-semibold text-white text-sm">Catch it with the right move</div>
              <div className="text-xs text-zinc-400 mt-0.5">Once you identify the Pokémon, you enter the catch phase. Pick the right move to successfully catch it — type matchups matter!</div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 items-start rounded-xl bg-zinc-800 border border-zinc-700 p-3">
          <div className="text-2xl">🏆</div>
          <div className="text-xs text-zinc-300">
            <span className="font-semibold text-white">Track your progress.</span>{" "}
            <Link to="/login" className="text-yellow-400 underline underline-offset-2 hover:text-yellow-300">
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

function GamePage() {
  const date = todayKey();
  const answer = useMemo(() => getDailyPokemon(date), [date]);
  const { user } = useAuth();
  const submitFn = useServerFn(submitDailyResult);

  const [guessIds, setGuessIds] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [catchPhaseActive, setCatchPhaseActive] = useState(false);
  const [catchResult, setCatchResult] = useState<{ caught: boolean; moveChosen: string } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  // Show welcome modal on first ever visit
  useEffect(() => {
    if (!localStorage.getItem("pokecatch_welcomed")) {
      setShowWelcome(true);
    }
  }, []);

  function dismissWelcome() {
    localStorage.setItem("pokecatch_welcomed", "1");
    setShowWelcome(false);
  }

  // Hydrate from localStorage on mount
  useEffect(() => {
    const { daily } = loadState();
    if (daily && daily.date === date) {
      setGuessIds(daily.guesses);
      setFinished(daily.finished);
      setWon(daily.won);
      setSubmitted(daily.submitted);
      // If already finished and won, catch phase is already done (page reload)
      if (daily.finished && daily.won) {
        setCatchResult(daily.catchResult ?? { caught: false, moveChosen: "" });
      }
    }
  }, [date]);

  const guesses = useMemo(
    () =>
      guessIds
        .map((id) => POKEMON_BY_NAME.get(getNameById(id)))
        .filter((p): p is Pokemon => !!p),
    [guessIds],
  );
  const results = useMemo(() => guesses.map((g) => compareGuess(g, answer)), [guesses, answer]);

  // Sync to server when finished and signed in
  useEffect(() => {
    if (!finished || submitted || !user) return;
    submitFn({
      data: {
        puzzleDate: date,
        guessesUsed: guessIds.length,
        won,
      },
    })
      .then(() => {
        setSubmitted(true);
        const state = loadState();
        if (state.daily) {
          state.daily.submitted = true;
          saveState(state);
        }
      })
      .catch((e) => console.error("Sync failed:", e));
  }, [finished, submitted, user, submitFn, date, guessIds.length, won]);

  function handleGuess(p: Pokemon) {
    if (finished) return;
    const newIds = [...guessIds, p.id];
    const isWin = p.id === answer.id;
    const isDone = isWin || newIds.length >= MAX_GUESSES;
    setGuessIds(newIds);
    if (isDone) {
      setFinished(true);
      setWon(isWin);
      if (isWin) {
        // Trigger catch phase before showing results
        setCatchPhaseActive(true);
      }
    }

    const state = loadState();
    const daily = {
      date,
      guesses: newIds,
      finished: isDone,
      won: isWin,
      submitted: false,
      catchResult: null,
    };
    const stats = isDone
      ? applyResultToStats(state.stats, isWin, newIds.length, date)
      : state.stats;
    saveState({ daily, stats });
  }

  async function handleCatchComplete(caught: boolean, moveChosen: string) {
    const result = { caught, moveChosen };
    setCatchResult(result);
    setCatchPhaseActive(false);
    // Persist catch result to localStorage
    const state = loadState();
    if (state.daily) {
      (state.daily as typeof state.daily & { catchResult: typeof result }).catchResult = result;
      saveState(state);
    }
    // Persist to Supabase if caught and signed in
    if (caught && user) {
      const { error } = await supabase
        .from("caught_pokemon")
        .upsert(
          {
            user_id: user.id,
            pokemon_id: answer.id,
            pokemon_name: answer.name,
            caught_at: new Date().toISOString(),
          },
          { onConflict: "user_id,pokemon_id" },
        );
      if (error) {
        console.error("Failed to save caught Pok\u00e9mon:", error);
      }
    }
  }

  function handleShare() {
    const grid = emojiGrid(results);
    const score = won ? `${guessIds.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const catchLine = catchResult
      ? catchResult.caught
        ? `🎯 Caught with ${catchResult.moveChosen}!`
        : `💨 It got away…`
      : "";
    const text = `Pokédle ${date} ${score}\n\n${grid}${catchLine ? `\n\n${catchLine}` : ""}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    }
  }

  const empties = finished ? 0 : Math.min(3, MAX_GUESSES - guesses.length);

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

      {/* Catch phase — shown after a correct guess, before the results card */}
      {catchPhaseActive && won && (
        <div className="rounded-xl border border-border bg-card p-6">
          <CatchPhase pokemon={answer} onCatchComplete={handleCatchComplete} />
        </div>
      )}

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
            <div className="text-2xl font-bold capitalize text-white">{answer.name.replace(/-/g, " ")}</div>
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
                <span className="text-muted-foreground">
                  💨 It got away…
                </span>
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
