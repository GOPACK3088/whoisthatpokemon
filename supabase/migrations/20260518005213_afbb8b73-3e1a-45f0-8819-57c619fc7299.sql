ALTER TABLE daily_results DROP CONSTRAINT IF EXISTS daily_results_guesses_used_check;
ALTER TABLE daily_results ADD CONSTRAINT daily_results_guesses_used_check CHECK (guesses_used BETWEEN 1 AND 10);

ALTER TABLE daily_results ADD COLUMN IF NOT EXISTS slot text NOT NULL DEFAULT 'am' CHECK (slot IN ('am', 'pm'));

ALTER TABLE daily_results DROP CONSTRAINT IF EXISTS daily_results_user_id_puzzle_date_key;
ALTER TABLE daily_results ADD CONSTRAINT daily_results_user_id_puzzle_date_slot_key UNIQUE (user_id, puzzle_date, slot);

CREATE TABLE IF NOT EXISTS catch_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  puzzle_date date NOT NULL,
  slot text NOT NULL CHECK (slot IN ('am', 'pm')),
  caught boolean NOT NULL,
  move_chosen text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, puzzle_date, slot)
);

CREATE TABLE IF NOT EXISTS caught_pokemon (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  pokemon_id integer NOT NULL,
  pokemon_name text NOT NULL,
  caught_at timestamptz DEFAULT now(),
  UNIQUE (user_id, pokemon_id)
);

ALTER TABLE catch_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all catch results" ON catch_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own catch results" ON catch_results FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

ALTER TABLE caught_pokemon ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all caught pokemon" ON caught_pokemon FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own caught pokemon" ON caught_pokemon FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);