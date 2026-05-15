# Daily Pokémon Guessing Game ("Pokédle")

A daily Wordle/Spotle-style game: one mystery Pokémon per day, 7 guesses, attribute-grid feedback. Optional accounts via Lovable Cloud for streaks and a global leaderboard.

## Core gameplay

- One mystery Pokémon per UTC day, identical for every player.
- 7 guesses per day. Player types/selects a Pokémon name (autocomplete dropdown over the full ~1000+ Pokédex).
- Each guess renders a row of attribute tiles compared to the answer:
  - **Type 1 / Type 2** — green = exact match, yellow = partial overlap (one of two types matches), red = no match
  - **Generation** — green = same, yellow = ±1 gen, red = further (with ▲/▼ arrow)
  - **Color** (Pokédex color) — green/red
  - **Height** — green = same, yellow = within 1m (with ▲/▼), red = further
  - **Weight** — green = same, yellow = within 10kg (with ▲/▼), red = further
  - **Evolution stage** (1/2/3 or single) — green/yellow/red with arrow
- Win when guess matches answer; lose after 7 wrong guesses. Reveal answer with sprite + a "Come back tomorrow" countdown to next UTC midnight.
- Local "today's progress" persists in `localStorage` so refresh doesn't reset state. Each day's puzzle is keyed by date so guesses from yesterday don't carry over.

## Pages / routes

- `/` — today's game board, guess input with autocomplete, attribute legend, countdown to next puzzle, share button (copies emoji-grid result).
- `/how-to-play` — rules and color legend.
- `/leaderboard` — global stats: today's solve rate, average guesses, top streaks (only signed-in users appear).
- `/login` — email/password + (optional) Google sign-in.
- `/profile` (auth) — current streak, max streak, guess distribution histogram, history of past days.

## Data

**Pokémon dataset**: bundled JSON file generated at build time from PokéAPI (so we don't hit the network at runtime). One-off script writes `src/data/pokemon.json` with `{ id, name, types, generation, color, height, weight, evolutionStage, spriteUrl }` for all Pokémon.

**Daily answer selection**: deterministic — `pokemon[hash(YYYY-MM-DD) % pokemon.length]`. Same for everyone, no DB needed for the puzzle itself.

**Lovable Cloud (Supabase) tables** (for accounts/leaderboard):
- `profiles` — id (FK auth.users), display_name, created_at
- `daily_results` — id, user_id, puzzle_date, guesses_used, won (bool), created_at; unique (user_id, puzzle_date)
- `user_stats` — user_id (PK), current_streak, max_streak, total_played, total_won, guess_distribution (jsonb)

RLS: users can read all `daily_results`/`user_stats` (for leaderboard) but only insert/update their own. Submission goes through a `submitDailyResult` server function that recomputes streak server-side to prevent tampering.

## Visual design

Clean modern game UI inspired by Wordle/Pokédle: centered single-column layout, large attribute grid with clear color tiles, smooth flip animation on reveal, official Pokémon sprite of the answer on win/lose. Light/dark mode via existing token system.

## Technical notes

- Stack: TanStack Start + Tailwind + shadcn (already in template).
- Enable Lovable Cloud for accounts/leaderboard.
- Bundled `pokemon.json` (~500KB gzipped) imported directly — no runtime PokéAPI calls. Sprites loaded from PokéAPI's CDN URLs stored in the JSON.
- Autocomplete uses `cmdk` (already in shadcn `command.tsx`) over the in-memory list.
- Anonymous play fully works; signing in syncs local results and starts tracking streaks.

## Build order

1. Enable Lovable Cloud + create schema/RLS.
2. Generate `pokemon.json` dataset script.
3. Core game logic + comparison function + `/` page with local-only state.
4. Auth pages + profile + result submission server function.
5. Leaderboard page.
6. Polish: share results, animations, how-to-play, dark mode.
