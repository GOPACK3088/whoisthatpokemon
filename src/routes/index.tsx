import { createFileRoute } from "@tanstack/react-router";
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
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";
import { submitDailyResult } from "@/lib/results.functions";

export const Route = createFileRoute("/")({
  component: GamePage,
  head: () => ({
    meta: [
      { title: "Pokédle — Daily Pokémon Guessing Game" },
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

function GamePage() {
  const date = todayKey();
  const answer = useMemo(() => getDailyPokemon(date), [date]);
  const { user } = useAuth();
  const submitFn = useServerFn(submitDailyResult);

  const [guessIds, setGuessIds] = useState<number[]>([]);
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const { daily } = loadState();
    if (daily && daily.date === date) {
      setGuessIds(daily.guesses);
      setFinished(daily.finished);
      setWon(daily.won);
      setSubmitted(daily.submitted);
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
    }

    const state = loadState();
    const daily = {
      date,
      guesses: newIds,
      finished: isDone,
      won: isWin,
      submitted: false,
    };
    const stats = isDone
      ? applyResultToStats(state.stats, isWin, newIds.length, date)
      : state.stats;
    saveState({ daily, stats });
  }

  function handleShare() {
    const grid = emojiGrid(results);
    const score = won ? `${guessIds.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
    const text = `Pokédle ${date} ${score}\n\n${grid}`;
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    }
  }

  const empties = MAX_GUESSES - guesses.length - (finished ? 0 : 0);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Daily Pokédle</h1>
        <p className="text-sm text-muted-foreground">
          Guess the mystery Pokémon in {MAX_GUESSES} tries. New puzzle in <Countdown />
        </p>
      </div>

      {!finished && (
        <GuessInput onGuess={handleGuess} excludeIds={guessIds} disabled={finished} />
      )}

      <div className="space-y-3">
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

      {finished && (
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
            <div className="text-2xl font-bold capitalize">{answer.name.replace(/-/g, " ")}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {won ? `Solved in ${guessIds.length}/${MAX_GUESSES}` : `Better luck tomorrow!`}
            </div>
          </div>
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
