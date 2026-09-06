-- Step 7: goals table.
-- Run this once in the Supabase dashboard -> SQL Editor -> New query -> Run.
-- Each row is one of the four shapes from src/lib/scoring/types.ts. The check
-- constraint below enforces that only the fields that shape actually uses are
-- filled in (e.g. a "range" goal must have min/max and no target).

create extension if not exists pgcrypto;

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  shape text not null check (shape in ('at_least', 'at_most', 'range', 'boolean')),
  target numeric(10, 2),
  min numeric(10, 2),
  max numeric(10, 2),
  weight smallint not null default 1 check (weight between 1 and 5),
  created_at timestamptz not null default now(),
  check (
    (shape in ('at_least', 'at_most') and target is not null and min is null and max is null)
    or (shape = 'range' and min is not null and max is not null and max > min and target is null)
    or (shape = 'boolean' and target is null and min is null and max is null)
  )
);

alter table public.goals enable row level security;

create policy "Users can view own goals"
  on public.goals for select
  using (auth.uid() = user_id);

create policy "Users can insert own goals"
  on public.goals for insert
  with check (auth.uid() = user_id);

create policy "Users can update own goals"
  on public.goals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own goals"
  on public.goals for delete
  using (auth.uid() = user_id);
