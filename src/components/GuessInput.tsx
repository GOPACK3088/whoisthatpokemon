import { useMemo, useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { POKEMON, type Pokemon } from "@/lib/pokemon";

export function GuessInput({
  onGuess,
  excludeIds,
  disabled,
  pokemonPool,
}: {
  onGuess: (p: Pokemon) => void;
  excludeIds: number[];
  disabled?: boolean;
  pokemonPool?: Pokemon[];
}) {
  const pool = pokemonPool ?? POKEMON;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const excl = new Set(excludeIds);
    return pool.filter((p) => !excl.has(p.id) && p.name.includes(q)).slice(0, 8);
  }, [query, excludeIds]);

  useEffect(() => {
    setHighlight(0);
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function submit(p?: Pokemon) {
    const pick = p ?? matches[highlight];
    if (!pick) return;
    onGuess(pick);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(h + 1, matches.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Guess a Pokémon…"
          disabled={disabled}
          autoComplete="off"
          className="flex-1 text-white placeholder:text-white/50 bg-transparent border-white/20"
        />
        <Button onClick={() => submit()} disabled={disabled || matches.length === 0}>
          Guess
        </Button>
      </div>
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-72 overflow-auto">
          {matches.map((p, i) => (
            <li
              key={p.id}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm capitalize ${
                i === highlight ? "bg-accent" : ""
              }`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                submit(p);
              }}
            >
              <img src={p.spriteUrl} alt="" className="w-8 h-8 object-contain" loading="lazy" />
              <span>{p.name.replace(/-/g, " ")}</span>
              <span className="ml-auto text-xs text-muted-foreground">#{p.id}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
