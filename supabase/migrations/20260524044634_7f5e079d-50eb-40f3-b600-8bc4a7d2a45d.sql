CREATE TABLE IF NOT EXISTS public.daily_puzzles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_date date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('am','pm')),
  pokemon_id integer NOT NULL,
  pokemon_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (puzzle_date, slot)
);

ALTER TABLE public.daily_puzzles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read daily puzzles" ON public.daily_puzzles
  FOR SELECT TO anon, authenticated USING (true);