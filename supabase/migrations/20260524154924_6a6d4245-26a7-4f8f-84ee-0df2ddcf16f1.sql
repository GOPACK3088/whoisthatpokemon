
ALTER TABLE public.daily_puzzles ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'classic' CHECK (mode IN ('classic','retro'));

UPDATE public.daily_puzzles SET mode = 'classic' WHERE mode IS NULL OR mode = '';

ALTER TABLE public.daily_puzzles DROP CONSTRAINT IF EXISTS daily_puzzles_puzzle_date_slot_key;
ALTER TABLE public.daily_puzzles ADD CONSTRAINT daily_puzzles_puzzle_date_slot_mode_key UNIQUE (puzzle_date, slot, mode);
