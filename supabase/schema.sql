-- Step 4: profiles table.
-- Run this once in the Supabase dashboard -> SQL Editor -> New query -> Run.
-- (No Supabase CLI/migrations set up for this project yet, so schema changes
-- are applied by hand this way, one numbered file at a time.)

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  age smallint not null check (age between 13 and 100),
  height_cm numeric(5, 1) not null check (height_cm between 100 and 250),
  weight_kg numeric(5, 1) not null check (weight_kg between 30 and 300),
  activity_level text not null check (
    activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')
  ),
  aim text not null check (aim in ('cut', 'bulk', 'maintain')),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
