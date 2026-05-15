
-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles readable to authenticated" on public.profiles for select to authenticated using (true);
create policy "users update own profile" on public.profiles for update to authenticated using (auth.uid() = id);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);

-- Daily results
create table public.daily_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  puzzle_date date not null,
  guesses_used integer not null check (guesses_used between 1 and 7),
  won boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, puzzle_date)
);
alter table public.daily_results enable row level security;
create policy "results readable to authenticated" on public.daily_results for select to authenticated using (true);
create policy "users insert own results" on public.daily_results for insert to authenticated with check (auth.uid() = user_id);

-- User stats
create table public.user_stats (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  max_streak integer not null default 0,
  total_played integer not null default 0,
  total_won integer not null default 0,
  guess_distribution jsonb not null default '{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0,"7":0}'::jsonb,
  last_puzzle_date date,
  updated_at timestamptz not null default now()
);
alter table public.user_stats enable row level security;
create policy "stats readable to authenticated" on public.user_stats for select to authenticated using (true);
create policy "users update own stats" on public.user_stats for update to authenticated using (auth.uid() = user_id);
create policy "users insert own stats" on public.user_stats for insert to authenticated with check (auth.uid() = user_id);

-- Auto-create profile + stats on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.user_stats (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
