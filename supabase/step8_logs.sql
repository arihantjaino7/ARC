-- Step 8: logs table.
-- Run this once in the Supabase dashboard -> SQL Editor -> New query -> Run.
-- One row per user per calendar day (not per goal) — the same logged number
-- can count toward more than one goal or challenge later. Columns mirror the
-- four target_* fields on public.profiles, plus a boolean for gym-done-style
-- goals.

create table if not exists public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  calories numeric(10, 2),
  protein_g numeric(10, 2),
  water_ml numeric(10, 2),
  sleep_hours numeric(10, 2),
  gym_done boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table public.logs enable row level security;

create policy "Users can view own logs"
  on public.logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own logs"
  on public.logs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own logs"
  on public.logs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
