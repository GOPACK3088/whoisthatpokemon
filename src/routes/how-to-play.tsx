import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/how-to-play")({
  component: HowToPlay,
  head: () => ({
    meta: [
      { title: "How to play — Pokédle" },
      { name: "description", content: "Rules and color legend for the daily Pokédle game." },
    ],
  }),
});

function Swatch({ cls, label, desc }: { cls: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className={`w-10 h-10 rounded-md flex-shrink-0 ${cls}`} />
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-sm text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}

function HowToPlay() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold">How to play</h1>
      <p className="text-muted-foreground">
        A new mystery Pokémon is chosen every day. You have <strong>7 guesses</strong> to figure
        out which one it is. After each guess, every attribute is colored to give you a clue.
      </p>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Tile colors</h2>
        <Swatch
          cls="bg-[var(--tile-correct)]"
          label="Green — exact match"
          desc="The attribute matches the answer exactly."
        />
        <Swatch
          cls="bg-[var(--tile-partial)]"
          label="Yellow — close"
          desc="Close but not exact (e.g. one of two types matches, or a number is within range)."
        />
        <Swatch
          cls="bg-[var(--tile-wrong)]"
          label="Gray — no match"
          desc="The attribute doesn't match and isn't close."
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Attributes compared</h2>
        <ul className="list-disc list-inside space-y-1 text-sm">
          <li><strong>Type 1 / Type 2</strong> — yellow if the type appears in the other slot.</li>
          <li><strong>Generation</strong> — yellow if within 1 generation. Arrow shows direction.</li>
          <li><strong>Color</strong> — Pokédex color (red, blue, green, yellow, etc.).</li>
          <li><strong>Height</strong> — yellow if within 1 m. Arrow points toward the answer.</li>
          <li><strong>Weight</strong> — yellow if within 10 kg. Arrow points toward the answer.</li>
          <li><strong>Evolution stage</strong> — shown as your stage / final stage in the chain.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Streaks &amp; leaderboard</h2>
        <p className="text-sm text-muted-foreground">
          Sign in to track your streak across days, see your guess distribution, and appear on the
          global leaderboard.
        </p>
      </section>
    </div>
  );
}
