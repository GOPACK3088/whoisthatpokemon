import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Pokemon } from "@/lib/pokemon";

const MOVES = ["Poké Ball", "Great Ball", "Ultra Ball", "Master Ball"];
const CATCH_RATES: Record<string, number> = {
  "Poké Ball": 0.4,
  "Great Ball": 0.6,
  "Ultra Ball": 0.8,
  "Master Ball": 1,
};

interface Props {
  pokemon: Pokemon;
  onCatchComplete: (caught: boolean, moveChosen: string) => void;
}

export function CatchPhase({ pokemon, onCatchComplete }: Props) {
  const [throwing, setThrowing] = useState(false);

  function handleThrow(move: string) {
    if (throwing) return;
    setThrowing(true);
    const caught = Math.random() < (CATCH_RATES[move] ?? 0.5);
    setTimeout(() => onCatchComplete(caught, move), 800);
  }

  return (
    <div className="text-center space-y-4">
      <img
        src={pokemon.spriteUrl}
        alt={pokemon.name}
        className="w-32 h-32 mx-auto object-contain"
      />
      <div>
        <div className="text-sm text-muted-foreground uppercase tracking-wide">
          A wild {pokemon.name.replace(/-/g, " ")} appeared!
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Choose a Poké Ball to try to catch it.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
        {MOVES.map((m) => (
          <Button
            key={m}
            variant="outline"
            disabled={throwing}
            onClick={() => handleThrow(m)}
          >
            {m}
          </Button>
        ))}
      </div>
    </div>
  );
}