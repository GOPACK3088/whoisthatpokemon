import type { GuessResult, AttributeResult } from "@/lib/pokemon";
import { ArrowDown, ArrowUp } from "lucide-react";

function tileClass(m: AttributeResult["match"]) {
  if (m === "correct")
    return "bg-[var(--tile-correct)] text-[var(--tile-correct-foreground)]";
  if (m === "partial")
    return "bg-[var(--tile-partial)] text-[var(--tile-partial-foreground)]";
  return "bg-[var(--tile-wrong)] text-[var(--tile-wrong-foreground)]";
}

function Tile({
  attr,
  label,
  value,
}: {
  attr: AttributeResult;
  label: string;
  value: string | number;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md p-1.5 sm:p-2 text-center transition-colors ${tileClass(attr.match)} min-h-[56px]`}
    >
      <div className="text-[9px] sm:text-[10px] uppercase opacity-70 tracking-wide leading-none">
        {label}
      </div>
      <div className="font-semibold text-xs sm:text-sm flex items-center gap-0.5 leading-tight mt-0.5">
        <span className="break-all">{value}</span>
        {attr.direction === "up" && <ArrowUp className="w-3 h-3" />}
        {attr.direction === "down" && <ArrowDown className="w-3 h-3" />}
      </div>
    </div>
  );
}

export function GuessRow({ result }: { result: GuessResult }) {
  const p = result.pokemon;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-sm">
        <img src={p.spriteUrl} alt={p.name} className="w-10 h-10 object-contain" loading="lazy" />
        <span className="font-medium capitalize">{p.name.replace(/-/g, " ")}</span>
      </div>
      <div className="grid grid-cols-7 gap-1">
        <Tile attr={result.type1} label="Type 1" value={p.types[0]} />
        <Tile attr={result.type2} label="Type 2" value={p.types[1] ?? "—"} />
        <Tile attr={result.generation} label="Gen" value={p.generation} />
        <Tile attr={result.color} label="Color" value={p.color} />
        <Tile attr={result.height} label="Height" value={`${p.height}m`} />
        <Tile attr={result.weight} label="Weight" value={`${p.weight}kg`} />
        <Tile attr={result.stage} label="Stage" value={`${p.stage}/${p.finalStage}`} />
      </div>
    </div>
  );
}
