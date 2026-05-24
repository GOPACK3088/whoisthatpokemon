-- Create daily_puzzles table for admin-controlled puzzle scheduling.
-- When a row exists for today's date + slot, it overrides the hash-based fallback.

create table if not exists public.daily_puzzles (
  id           uuid primary key default gen_random_uuid(),
  puzzle_date  date        not null,
  slot         text        not null check (slot in ('am', 'pm')),
  pokemon_id   integer     not null,
  pokemon_name text        not null,
  created_at   timestamptz not null default now(),

  constraint daily_puzzles_date_slot_key unique (puzzle_date, slot)
);

-- Enable RLS
alter table public.daily_puzzles enable row level security;

-- Public read: anyone (including anon) can fetch today's puzzle
create policy "Public read daily_puzzles"
  on public.daily_puzzles
  for select
  using (true);

-- Only service role / authenticated admins should insert/update rows.
-- No insert/update policy here — manage via Supabase dashboard or service key.
